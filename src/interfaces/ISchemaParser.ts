import type { ContentModelType, DocumentNode } from '../types'

/**
 * Read-only schema query contract.  Implemented by SchemaParser; consumed by
 * SchemaWorker and TemplateBuilder.  No Monaco dependency — fully testable in Node.
 */
export interface ISchemaParser {
    /** Top-level xs:element declarations (valid XML root elements). */
    getRootElements(): DocumentNode[]

    /**
     * All direct child elements allowed under `elementName`.
     * When `ancestorChain` is provided the result is context-aware: the chain
     * is walked top-down to resolve the exact type of `elementName` before
     * collecting children.
     */
    getSubElements(elementName: string, ancestorChain?: string[]): DocumentNode[]

    /**
     * For template generation: returns sequence members in full and only the
     * first branch of each xs:choice.
     */
    getFirstSubElements(elementName: string, withAttributes: boolean): DocumentNode[]

    /**
     * xs:attribute declarations for `elementName`.
     * When `ancestorChain` is provided the result is context-aware: the correct
     * complex type is resolved via the ancestor path before collecting attributes.
     */
    getAttributesForElement(elementName: string, ancestorChain?: string[]): DocumentNode[]

    /**
     * Allowed enum values for a specific attribute on `elementName`.
     * When `ancestorChain` is provided the attribute type is resolved in context.
     */
    getEnumValuesForAttribute(elementName: string, attrName: string, ancestorChain?: string[]): string[]

    /** Allowed enum values looked up by the named simpleType directly. */
    getEnumValuesForNamedType(typeName: string): string[]

    /** sequence | choice | all | simpleContent, or null when unknown. */
    getContentModelType(elementName: string): ContentModelType | null
}
