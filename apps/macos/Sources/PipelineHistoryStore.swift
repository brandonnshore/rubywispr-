import Foundation
import CoreData

final class PipelineHistoryStore {
    private let container: NSPersistentContainer
    private let isStoreLoaded: Bool

    convenience init() {
        self.init(storeURL: Self.defaultStoreURL())
    }

    init(storeURL: URL?, inMemory: Bool = false) {
        let model = Self.makeModel()
        container = NSPersistentContainer(name: "PipelineHistory", managedObjectModel: model)

        if inMemory {
            let description = NSPersistentStoreDescription()
            description.type = NSInMemoryStoreType
            container.persistentStoreDescriptions = [description]
        } else if let storeURL {
            let description = NSPersistentStoreDescription(url: storeURL)
            description.shouldMigrateStoreAutomatically = true
            description.shouldInferMappingModelAutomatically = true
            container.persistentStoreDescriptions = [description]
        } else {
            container.persistentStoreDescriptions = [NSPersistentStoreDescription()]
        }

        if Self.loadPersistentStoresSynchronously(container: container) == nil {
            isStoreLoaded = true
        } else {
            if let storeURL {
                print("[PipelineHistoryStore] Failed to load persistent store. Attempting recovery.")
                Self.destroySQLiteStoreFiles(at: storeURL)

                // Clear any partially loaded stores and reset descriptions before retrying.
                let coordinator = container.persistentStoreCoordinator
                for store in coordinator.persistentStores {
                    try? coordinator.remove(store)
                }

                let recoveryDescription = NSPersistentStoreDescription(url: storeURL)
                recoveryDescription.shouldMigrateStoreAutomatically = true
                recoveryDescription.shouldInferMappingModelAutomatically = true
                container.persistentStoreDescriptions = [recoveryDescription]
            }

            if Self.loadPersistentStoresSynchronously(container: container) == nil {
                isStoreLoaded = true
            } else {
                print("[PipelineHistoryStore] Failed to recover persistent store. Falling back to in-memory history.")
                let coordinator = container.persistentStoreCoordinator
                for store in coordinator.persistentStores {
                    try? coordinator.remove(store)
                }
                let description = NSPersistentStoreDescription()
                description.type = NSInMemoryStoreType
                container.persistentStoreDescriptions = [description]
                isStoreLoaded = Self.loadPersistentStoresSynchronously(container: container) == nil
            }
        }
    }

    private static func defaultStoreURL() -> URL? {
        guard let appSupport = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first else {
            return nil
        }

        let baseURL = appSupport.appendingPathComponent(AppName.displayName, isDirectory: true)
        try? FileManager.default.createDirectory(at: baseURL, withIntermediateDirectories: true)
        return baseURL.appendingPathComponent("PipelineHistory.sqlite")
    }

    func loadAllHistory() -> [PipelineHistoryItem] {
        guard isStoreLoaded else { return [] }
        var result: [PipelineHistoryItem] = []
        container.viewContext.performAndWait {
            let request = pipelineHistoryRequest()
            request.sortDescriptors = [NSSortDescriptor(key: "timestamp", ascending: false)]
            guard let entities = try? container.viewContext.fetch(request) else { return }
            result = entities.compactMap(Self.makeHistoryItem(from:))
        }
        return result
    }

    func append(_ item: PipelineHistoryItem, maxCount: Int) throws -> [String] {
        guard isStoreLoaded else { return [] }
        try insert(item)
        return try trim(to: maxCount)
    }

    func update(_ item: PipelineHistoryItem) throws {
        guard isStoreLoaded else { return }

        var thrownError: Error?
        container.viewContext.performAndWait {
            do {
                let request = pipelineHistoryRequest()
                request.predicate = NSPredicate(format: "id == %@", item.id as CVarArg)
                guard let entity = try container.viewContext.fetch(request).first else { return }
                Self.applyMetadataOnlyValues(from: item, to: entity, includeTimestamp: false)
                try saveContext()
            } catch {
                thrownError = error
            }
        }
        if let thrownError { throw thrownError }
    }

    func sanitizePersistedContentReferences() throws -> [String] {
        guard isStoreLoaded else { return [] }

        var audioFileNames: [String] = []
        var thrownError: Error?
        container.viewContext.performAndWait {
            do {
                let request = pipelineHistoryRequest()
                guard let entities = try? container.viewContext.fetch(request) else { return }
                for entity in entities {
                    if let audioFileName = entity.audioFileName {
                        audioFileNames.append(audioFileName)
                        entity.audioFileName = nil
                    }
                    entity.selectedText = nil
                    entity.capturedSelection = nil
                    entity.rawTranscript = ""
                    entity.postProcessedTranscript = ""
                    entity.postProcessingPrompt = nil
                    entity.systemPrompt = nil
                    entity.contextSummary = ""
                    entity.contextSystemPrompt = nil
                    entity.contextPrompt = nil
                    entity.contextScreenshotDataURL = nil
                    entity.customVocabulary = ""
                    entity.contextAppName = nil
                    entity.contextBundleIdentifier = nil
                    entity.contextWindowTitle = nil
                }
                try saveContext()
            } catch {
                thrownError = error
            }
        }
        if let thrownError { throw thrownError }
        return audioFileNames
    }

    func delete(id: UUID) throws -> String? {
        guard isStoreLoaded else { return nil }

        var deletedAudioFileName: String?
        var thrownError: Error?
        container.viewContext.performAndWait {
            do {
                let request = pipelineHistoryRequest()
                request.predicate = NSPredicate(format: "id == %@", id as CVarArg)
                guard let entity = try container.viewContext.fetch(request).first else { return }
                deletedAudioFileName = entity.audioFileName
                container.viewContext.delete(entity)
                try saveContext()
            } catch {
                thrownError = error
            }
        }
        if let thrownError { throw thrownError }
        return deletedAudioFileName
    }

    func clearAll() throws -> [String] {
        guard isStoreLoaded else { return [] }

        var audioFileNames: [String] = []
        var thrownError: Error?
        container.viewContext.performAndWait {
            do {
                let request = pipelineHistoryRequest()
                request.sortDescriptors = [NSSortDescriptor(key: "timestamp", ascending: false)]
                guard let entities = try? container.viewContext.fetch(request) else { return }
                audioFileNames = entities.compactMap(\.audioFileName)
                for entity in entities {
                    container.viewContext.delete(entity)
                }
                try saveContext()
            } catch {
                thrownError = error
            }
        }
        if let thrownError { throw thrownError }
        return audioFileNames
    }

    func trim(to maxCount: Int) throws -> [String] {
        guard isStoreLoaded else { return [] }
        guard maxCount > 0 else {
            let audioFileNames = try clearAll()
            return audioFileNames
        }

        var audioFileNames: [String] = []
        var thrownError: Error?
        container.viewContext.performAndWait {
            do {
                let request = pipelineHistoryRequest()
                request.sortDescriptors = [NSSortDescriptor(key: "timestamp", ascending: false)]
                guard let entities = try? container.viewContext.fetch(request), entities.count > maxCount else { return }
                let dropped = entities[maxCount...]
                audioFileNames = dropped.compactMap(\.audioFileName)
                for entity in dropped {
                    container.viewContext.delete(entity)
                }
                try saveContext()
            } catch {
                thrownError = error
            }
        }
        if let thrownError { throw thrownError }
        return audioFileNames
    }

    private func insert(_ item: PipelineHistoryItem) throws {
        guard isStoreLoaded else { return }

        var thrownError: Error?
        container.viewContext.performAndWait {
            do {
                let context = container.viewContext
                let entity = PipelineHistoryEntry(context: context)
                Self.applyMetadataOnlyValues(from: item, to: entity, includeTimestamp: true)
                try saveContext()
            } catch {
                thrownError = error
            }
        }
        if let thrownError { throw thrownError }
    }

    private func saveContext() throws {
        guard container.viewContext.hasChanges else { return }
        do {
            try container.viewContext.save()
        } catch {
            container.viewContext.rollback()
            throw error
        }
    }

    private func pipelineHistoryRequest() -> NSFetchRequest<PipelineHistoryEntry> {
        NSFetchRequest<PipelineHistoryEntry>(entityName: "PipelineHistoryEntry")
    }

    private static func applyMetadataOnlyValues(
        from item: PipelineHistoryItem,
        to entity: PipelineHistoryEntry,
        includeTimestamp: Bool
    ) {
        entity.id = item.id
        entity.intent = item.intent.rawValue
        if includeTimestamp {
            entity.timestamp = item.timestamp
        }
        entity.selectedText = nil
        entity.capturedSelection = nil
        entity.rawTranscript = ""
        entity.postProcessedTranscript = ""
        entity.postProcessingPrompt = nil
        entity.systemPrompt = nil
        entity.contextSummary = ""
        entity.contextSystemPrompt = nil
        entity.contextPrompt = nil
        entity.contextScreenshotDataURL = nil
        entity.contextScreenshotStatus = item.contextScreenshotStatus
        entity.postProcessingStatus = item.postProcessingStatus
        entity.debugStatus = item.debugStatus
        entity.timingSummary = item.timingSummary
        entity.customVocabulary = ""
        entity.audioFileName = nil
        entity.contextAppName = nil
        entity.contextBundleIdentifier = nil
        entity.contextWindowTitle = nil
    }

    // Safe: loadPersistentStores calls back on a private queue, not the calling thread.
    private static func loadPersistentStoresSynchronously(container: NSPersistentContainer) -> Error? {
        let semaphore = DispatchSemaphore(value: 0)
        let lock = NSLock()
        var capturedError: Error?
        var remainingCompletions = max(1, container.persistentStoreDescriptions.count)

        container.loadPersistentStores { _, error in
            lock.lock()
            if capturedError == nil, let error {
                capturedError = error
            }
            remainingCompletions -= 1
            let shouldSignal = remainingCompletions <= 0
            lock.unlock()

            if shouldSignal {
                semaphore.signal()
            }
        }

        semaphore.wait()
        return capturedError
    }

    private static func destroySQLiteStoreFiles(at storeURL: URL) {
        let basePath = storeURL.path
        let fileManager = FileManager.default
        for path in [basePath, basePath + "-wal", basePath + "-shm"] {
            try? fileManager.removeItem(atPath: path)
        }
    }

    private static func makeHistoryItem(from entity: PipelineHistoryEntry) -> PipelineHistoryItem {
        PipelineHistoryItem(
            intent: PipelineHistoryItemIntent(rawValue: entity.intent ?? "") ?? .dictation,
            id: entity.id,
            timestamp: entity.timestamp ?? Date(),
            contextScreenshotStatus: entity.contextScreenshotStatus ?? "available (image)",
            postProcessingStatus: entity.postProcessingStatus ?? "",
            debugStatus: entity.debugStatus ?? "",
            timingSummary: entity.timingSummary ?? ""
        )
    }

#if DEBUG
    func insertLegacyUnsafeContentForPrivacyTest(_ item: PipelineHistoryItem, forbiddenValue: String) throws {
        guard isStoreLoaded else { return }

        var thrownError: Error?
        container.viewContext.performAndWait {
            do {
                let entity = PipelineHistoryEntry(context: container.viewContext)
                entity.id = item.id
                entity.intent = item.intent.rawValue
                entity.selectedText = forbiddenValue
                entity.capturedSelection = forbiddenValue
                entity.timestamp = item.timestamp
                entity.rawTranscript = forbiddenValue
                entity.postProcessedTranscript = forbiddenValue
                entity.postProcessingPrompt = forbiddenValue
                entity.systemPrompt = forbiddenValue
                entity.contextSummary = forbiddenValue
                entity.contextSystemPrompt = forbiddenValue
                entity.contextPrompt = forbiddenValue
                entity.contextScreenshotDataURL = forbiddenValue
                entity.contextScreenshotStatus = item.contextScreenshotStatus
                entity.postProcessingStatus = item.postProcessingStatus
                entity.debugStatus = item.debugStatus
                entity.timingSummary = item.timingSummary
                entity.customVocabulary = forbiddenValue
                entity.audioFileName = forbiddenValue
                entity.contextAppName = forbiddenValue
                entity.contextBundleIdentifier = forbiddenValue
                entity.contextWindowTitle = forbiddenValue
                try saveContext()
            } catch {
                thrownError = error
            }
        }
        if let thrownError { throw thrownError }
    }
#endif

    private static func makeModel() -> NSManagedObjectModel {
        let model = NSManagedObjectModel()

        let entity = NSEntityDescription()
        entity.name = "PipelineHistoryEntry"
        entity.managedObjectClassName = NSStringFromClass(PipelineHistoryEntry.self)

        entity.properties = [
            makeAttribute(name: "intent", type: .stringAttributeType, isOptional: true, defaultValue: "dictation"),
            makeAttribute(name: "selectedText", type: .stringAttributeType, isOptional: true),
            makeAttribute(name: "capturedSelection", type: .stringAttributeType, isOptional: true),
            makeAttribute(name: "id", type: .UUIDAttributeType, isOptional: false),
            makeAttribute(name: "timestamp", type: .dateAttributeType, isOptional: false),
            makeAttribute(name: "rawTranscript", type: .stringAttributeType, isOptional: false),
            makeAttribute(name: "postProcessedTranscript", type: .stringAttributeType, isOptional: false),
            makeAttribute(name: "postProcessingPrompt", type: .stringAttributeType, isOptional: true),
            makeAttribute(name: "systemPrompt", type: .stringAttributeType, isOptional: true),
            makeAttribute(name: "contextSummary", type: .stringAttributeType, isOptional: false),
            makeAttribute(name: "contextSystemPrompt", type: .stringAttributeType, isOptional: true),
            makeAttribute(name: "contextPrompt", type: .stringAttributeType, isOptional: true),
            makeAttribute(name: "contextScreenshotDataURL", type: .stringAttributeType, isOptional: true),
            makeAttribute(name: "contextScreenshotStatus", type: .stringAttributeType, isOptional: false),
            makeAttribute(name: "postProcessingStatus", type: .stringAttributeType, isOptional: false),
            makeAttribute(name: "debugStatus", type: .stringAttributeType, isOptional: false),
            makeAttribute(name: "timingSummary", type: .stringAttributeType, isOptional: true, defaultValue: ""),
            makeAttribute(name: "customVocabulary", type: .stringAttributeType, isOptional: false),
            makeAttribute(name: "audioFileName", type: .stringAttributeType, isOptional: true),
            makeAttribute(name: "contextAppName", type: .stringAttributeType, isOptional: true),
            makeAttribute(name: "contextBundleIdentifier", type: .stringAttributeType, isOptional: true),
            makeAttribute(name: "contextWindowTitle", type: .stringAttributeType, isOptional: true)
        ]

        model.entities = [entity]
        return model
    }

    private static func makeAttribute(
        name: String,
        type: NSAttributeType,
        isOptional: Bool,
        defaultValue: Any? = nil
    ) -> NSAttributeDescription {
        let attribute = NSAttributeDescription()
        attribute.name = name
        attribute.attributeType = type
        attribute.isOptional = isOptional
        attribute.defaultValue = defaultValue
        return attribute
    }
}

@objc(PipelineHistoryEntry)
final class PipelineHistoryEntry: NSManagedObject {
    @NSManaged var id: UUID
    @NSManaged var intent: String?
    @NSManaged var selectedText: String?
    @NSManaged var capturedSelection: String?
    @NSManaged var timestamp: Date?
    @NSManaged var rawTranscript: String?
    @NSManaged var postProcessedTranscript: String?
    @NSManaged var postProcessingPrompt: String?
    @NSManaged var systemPrompt: String?
    @NSManaged var contextSummary: String?
    @NSManaged var contextSystemPrompt: String?
    @NSManaged var contextPrompt: String?
    @NSManaged var contextScreenshotDataURL: String?
    @NSManaged var contextScreenshotStatus: String?
    @NSManaged var postProcessingStatus: String?
    @NSManaged var debugStatus: String?
    @NSManaged var timingSummary: String?
    @NSManaged var customVocabulary: String?
    @NSManaged var audioFileName: String?
    @NSManaged var contextAppName: String?
    @NSManaged var contextBundleIdentifier: String?
    @NSManaged var contextWindowTitle: String?
}
