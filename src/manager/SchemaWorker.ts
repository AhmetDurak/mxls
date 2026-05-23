import { CompletionType, type ContentModelType, type DocumentNode, type ICompletion, type IXsd } from '../types'
import type { ISchemaWorker } from '../interfaces/ISchemaWorker'
import type { IMonacoApi } from '../interfaces/IMonacoApi'
import { SchemaParser } from '../parser/SchemaParser'
import { CompletionBuilder } from '../completion/CompletionBuilder'

/**
 * Per-schema facade.  Wraps SchemaParser + CompletionBuilder and implements ISchemaWorker.
 * Use SchemaWorker.create() to instantiate; withNamespace() clones with a prefix bound.
 */
export class SchemaWorker implements ISchemaWorker {
    readonly xsd: IXsd

    private constructor(
        xsd: IXsd,
        private readonly parser: SchemaParser,
        private readonly builder: CompletionBuilder,
        private readonly ns: string | undefined,
    ) {
        this.xsd = xsd
    }

    static create(xsd: IXsd, monacoApi: IMonacoApi): SchemaWorker {
        return new SchemaWorker(xsd, new SchemaParser(xsd), new CompletionBuilder(monacoApi), undefined)
    }

    withNamespace(namespace: string): ISchemaWorker {
        return new SchemaWorker(this.xsd, this.parser, this.builder, namespace)
    }

    doCompletion(
        type: CompletionType,
        parentTag: string,
        ancestorChain?: string[],
    ): ICompletion[] {
        switch (type) {
            case CompletionType.element: {
                const nodes = parentTag
                    ? this.parser.getSubElements(parentTag, ancestorChain)
                    : this.parser.getRootElements()
                return this.builder.buildElements(nodes, this.ns, false, false)
            }
            case CompletionType.incompleteElement: {
                const nodes = parentTag
                    ? this.parser.getSubElements(parentTag, ancestorChain)
                    : this.parser.getRootElements()
                return this.builder.buildElements(nodes, this.ns, true, true)
            }
            case CompletionType.attribute:
            case CompletionType.incompleteAttribute: {
                const nodes = this.parser.getAttributesForElement(parentTag)
                return this.builder.buildAttributes(nodes, type === CompletionType.incompleteAttribute)
            }
            default:
                return []
        }
    }

    getRootElements(): DocumentNode[] {
        return this.parser.getRootElements()
    }

    getSubElements(parentTag: string, ancestorChain?: string[]): DocumentNode[] {
        return this.parser.getSubElements(parentTag, ancestorChain)
    }

    getFirstSubElements(parentTag: string, withAttributes: boolean): DocumentNode[] {
        return this.parser.getFirstSubElements(parentTag, withAttributes)
    }

    getAttributesForElement(elementName: string): DocumentNode[] {
        return this.parser.getAttributesForElement(elementName)
    }

    getEnumValuesForAttribute(elementName: string, attrName: string): string[] {
        return this.parser.getEnumValuesForAttribute(elementName, attrName)
    }

    getEnumValuesForNamedType(typeName: string): string[] {
        return this.parser.getEnumValuesForNamedType(typeName)
    }

    getContentModelType(elementName: string): ContentModelType | null {
        return this.parser.getContentModelType(elementName)
    }
}
