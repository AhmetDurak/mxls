import type { ContentModelType, DocumentNode, IXsd } from '../types'
import type { ISchemaParser } from '../interfaces/ISchemaParser'
import { SchemaIndex } from './SchemaIndex'
import { SchemaQuery } from './SchemaQuery'

/**
 * Public entry point for the parser module.
 * Composes SchemaIndex (build phase) and SchemaQuery (query phase).
 * Implements ISchemaParser by delegating to SchemaQuery.
 */
export class SchemaParser implements ISchemaParser {
    private readonly query: SchemaQuery

    constructor(xsd: IXsd) {
        const index = new SchemaIndex(xsd)
        this.query = new SchemaQuery(index)
    }

    getRootElements(): DocumentNode[] {
        return this.query.getRootElements()
    }

    getSubElements(elementName: string, ancestorChain?: string[]): DocumentNode[] {
        return this.query.getSubElements(elementName, ancestorChain)
    }

    getFirstSubElements(elementName: string, withAttributes: boolean): DocumentNode[] {
        return this.query.getFirstSubElements(elementName, withAttributes)
    }

    getAttributesForElement(elementName: string, ancestorChain?: string[]): DocumentNode[] {
        return this.query.getAttributesForElement(elementName, ancestorChain)
    }

    getEnumValuesForAttribute(elementName: string, attrName: string, ancestorChain?: string[]): string[] {
        return this.query.getEnumValuesForAttribute(elementName, attrName, ancestorChain)
    }

    getEnumValuesForNamedType(typeName: string): string[] {
        return this.query.getEnumValuesForNamedType(typeName)
    }

    getContentModelType(elementName: string): ContentModelType | null {
        return this.query.getContentModelType(elementName)
    }

    /** Returns the child elements declared inside a named xs:group. */
    getElementsFromGroup(groupNode: DocumentNode): DocumentNode[] {
        return this.query.getElementsFromGroup(groupNode)
    }

    /** Returns the attributes declared inside a named xs:attributeGroup. */
    getAttributesFromAttributeGroup(attrGroupNode: DocumentNode): DocumentNode[] {
        return this.query.getAttributesFromAttributeGroup(attrGroupNode)
    }
}
