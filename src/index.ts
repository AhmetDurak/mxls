// Public API
export { EditorPlugin } from './features/EditorPlugin'
export type { EditorPluginOptions } from './features/EditorPlugin'
export { SchemaRegistry } from './manager/SchemaRegistry'
export { SchemaWorker } from './manager/SchemaWorker'
export { TemplateBuilder } from './template/TemplateBuilder'

// Re-export types
export type {
    IXsd,
    DocumentNode,
    ValidationError,
    ICompletion,
    INamespaceInfo,
    ContentModelType,
} from './types'
export { CompletionType, Severity } from './types'
export type { IMonacoApi } from './interfaces/IMonacoApi'
export type { ISchemaRegistry } from './interfaces/ISchemaRegistry'
export type { ISchemaWorker } from './interfaces/ISchemaWorker'
export type { ISchemaParser } from './interfaces/ISchemaParser'
