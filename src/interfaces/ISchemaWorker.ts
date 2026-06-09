import type { CompletionType, ContentModelType, DocumentNode, ICompletion, IXsd } from '../types'

/**
 * Per-schema worker contract.  Each registered XSD gets one ISchemaWorker.
 * Provides both the raw schema query API (delegating to ISchemaParser) and the
 * completion API used by SchemaCompleter.
 */
export interface ISchemaWorker {
    /** The XSD config this worker was built from. */
    readonly xsd: IXsd

    /**
     * Returns a copy of this worker bound to the given XML namespace prefix.
     * Completions produced by `doCompletion` will be prefixed accordingly.
     */
    withNamespace(namespace: string): ISchemaWorker

    /** Produce completions for the given context. */
    doCompletion(
        type: CompletionType,
        parentTag: string,
        ancestorChain?: string[],
    ): ICompletion[]

    getRootElements(): DocumentNode[]
    getSubElements(parentTag: string, ancestorChain?: string[]): DocumentNode[]
    getFirstSubElements(parentTag: string, withAttributes: boolean): DocumentNode[]
    getAttributesForElement(elementName: string, ancestorChain?: string[]): DocumentNode[]
    getEnumValuesForAttribute(elementName: string, attrName: string, ancestorChain?: string[]): string[]
    getEnumValuesForNamedType(typeName: string): string[]
    getContentModelType(elementName: string): ContentModelType | null
}
