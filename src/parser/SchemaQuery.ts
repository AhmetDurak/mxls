import type { ContentModelType, DocumentNode } from '../types'
import type { ISchemaParser } from '../interfaces/ISchemaParser'
import {
    SchemaIndex,
    XSD_NS,
    CONTAINER_LOCAL_NAMES,
    firstChildByLocalName,
    directChildElements,
    childrenByLocalName,
    stripNsPrefix,
} from './SchemaIndex'

/**
 * Answers schema queries by reading the maps built by SchemaIndex.
 * Has no mutable state — all methods are effectively pure given a fixed index.
 */
export class SchemaQuery implements ISchemaParser {
    constructor(private readonly index: SchemaIndex) {}

    // ─── ISchemaParser ────────────────────────────────────────────────────────

    getRootElements(): DocumentNode[] {
        const schemaRoot = this.index.doc.documentElement as unknown as Element
        const els = childrenByLocalName(schemaRoot, 'element').map(el => this.parseElement(el))
        return this.withRequiredAttributes(els)
    }

    getSubElements(elementName: string, ancestorChain?: string[]): DocumentNode[] {
        // Context-aware path: walk ancestor chain to pinpoint the element's exact type
        if (ancestorChain && ancestorChain.length > 0) {
            const specificType = this.resolveTypeInContext(elementName, ancestorChain)
            if (specificType) {
                const ct = this.index.complexTypeMap.get(specificType)
                if (ct) {
                    const collected: Element[] = []
                    this.collectElements(ct, collected, new Set(), false)
                    const nodes = collected.map(el => this.parseElement(el))
                    const hasAny = ct.getElementsByTagNameNS(XSD_NS, 'any').length > 0
                    const base = hasAny ? nodes.concat(this.getRootElements()) : nodes
                    return this.withRequiredAttributes(base)
                }
            }
        }

        // Fallback: union across all registered types for this element name
        const typeNames = this.index.elementTypesMultiMap.get(elementName)
        if (!typeNames || typeNames.size === 0) return []

        const seenNames = new Set<string>()
        const collected: Element[] = []
        let hasAny = false

        for (const typeName of typeNames) {
            const ct = this.index.complexTypeMap.get(typeName)
            if (!ct) continue
            if (ct.getElementsByTagNameNS(XSD_NS, 'any').length > 0) hasAny = true
            const perType: Element[] = []
            this.collectElements(ct, perType, new Set(), false)
            for (const el of perType) {
                const localName = stripNsPrefix(
                    el.getAttribute('name') ?? el.getAttribute('ref') ?? '',
                )
                if (localName && !seenNames.has(localName)) {
                    seenNames.add(localName)
                    collected.push(el)
                }
            }
        }

        const nodes = collected.map(el => this.parseElement(el))
        const base = hasAny ? nodes.concat(this.getRootElements()) : nodes
        return this.withRequiredAttributes(base)
    }

    getFirstSubElements(elementName: string, withAttributes: boolean): DocumentNode[] {
        const ct = this.complexTypeForElement(elementName)
        if (!ct) return []

        // Unwrap complexContent/extension or complexContent/restriction before traversal
        const cc = firstChildByLocalName(ct, 'complexContent')
        const unwrapped =
            cc &&
            (firstChildByLocalName(cc, 'extension') ??
                firstChildByLocalName(cc, 'restriction'))

        const traversalRoot = unwrapped ?? ct
        const collected: Element[] = []
        this.collectElements(traversalRoot, collected, new Set(), true)
        const nodes = collected.map(el => this.parseElement(el))
        return withAttributes ? this.withRequiredAttributes(nodes) : nodes
    }

    getAttributesForElement(elementName: string): DocumentNode[] {
        const ct = this.complexTypeForElement(elementName)
        if (!ct) return []
        return this.collectAttributes(ct).map(el => {
            const node = this.parseElement(el)
            const pattern = this.patternFromAttr(el)
            if (pattern !== undefined) node.pattern = pattern
            return node
        })
    }

    getEnumValuesForAttribute(elementName: string, attrName: string): string[] {
        const ct = this.complexTypeForElement(elementName)
        if (!ct) return []

        const attrEl = this.collectAttributes(ct).find(
            el =>
                el.getAttribute('name') === attrName ||
                el.getAttribute('ref') === attrName,
        )
        if (!attrEl) return []

        // Inline simpleType takes priority
        const inlineEnums = this.enumsFromInlineSimpleType(attrEl)
        if (inlineEnums.length > 0) return inlineEnums

        // Named type fallback
        const typeName = attrEl.getAttribute('type')
        if (typeName) return this.getEnumValuesForNamedType(stripNsPrefix(typeName))
        return []
    }

    getEnumValuesForNamedType(typeName: string): string[] {
        const st = this.index.simpleTypeMap.get(typeName)
        return st ? this.enumsFromSimpleType(st) : []
    }

    getContentModelType(elementName: string): ContentModelType | null {
        const ct = this.complexTypeForElement(elementName)
        return ct ? this.detectContentModel(ct) : null
    }

    // ─── Group / attributeGroup helpers ──────────────────────────────────────

    getElementsFromGroup(groupNode: DocumentNode): DocumentNode[] {
        const ref = groupNode.ref
        if (!ref) return []
        const group = this.index.groupMap.get(ref)
        if (!group) return []
        const collected: Element[] = []
        this.collectElements(group, collected, new Set([ref]), false)
        return collected.map(el => this.parseElement(el))
    }

    getAttributesFromAttributeGroup(attrGroupNode: DocumentNode): DocumentNode[] {
        const ref = attrGroupNode.ref
        if (!ref) return []
        return this.attributesFromGroup(ref).map(el => this.parseElement(el))
    }

    // ─── Context-aware resolution ─────────────────────────────────────────────

    private resolveTypeInContext(
        elementName: string,
        ancestorChain: string[],
    ): string | undefined {
        if (ancestorChain.length === 0) {
            return this.index.elementTypeMap.get(elementName)
        }

        let currentType = this.index.elementTypeMap.get(ancestorChain[0])
        for (let i = 1; i < ancestorChain.length; i++) {
            if (!currentType) return undefined
            currentType = this.findChildType(ancestorChain[i], currentType)
        }
        if (!currentType) return undefined
        return this.findChildType(elementName, currentType)
    }

    private findChildType(
        childName: string,
        parentTypeName: string,
    ): string | undefined {
        const ct = this.index.complexTypeMap.get(parentTypeName)
        if (!ct) return undefined

        const elements: Element[] = []
        this.collectElements(ct, elements, new Set(), false)

        const match = elements.find(el => {
            const candidate = stripNsPrefix(
                el.getAttribute('name') ?? el.getAttribute('ref') ?? '',
            )
            return candidate === childName
        })
        if (!match) return undefined

        const typeAttr = match.getAttribute('type')
        if (typeAttr) return stripNsPrefix(typeAttr)

        return firstChildByLocalName(match, 'complexType')
            ? `__inline__${childName}`
            : undefined
    }

    // ─── Content model traversal ──────────────────────────────────────────────

    private collectElements(
        node: Element,
        result: Element[],
        visited: Set<string>,
        firstOnly: boolean,
    ): void {
        for (const child of directChildElements(node)) {
            switch (child.localName) {
                case 'element':
                    result.push(child)
                    break
                case 'choice':
                    if (firstOnly) {
                        this.collectFirstBranchOfChoice(child, result, visited)
                    } else {
                        this.collectElements(child, result, visited, false)
                    }
                    break
                case 'group':
                    this.followGroupRef(child, result, visited, firstOnly)
                    break
                default:
                    if (CONTAINER_LOCAL_NAMES.has(child.localName ?? '')) {
                        this.collectElements(child, result, visited, firstOnly)
                    }
                    break
            }
        }
    }

    private collectFirstBranchOfChoice(
        choice: Element,
        result: Element[],
        visited: Set<string>,
    ): void {
        const firstEl = firstChildByLocalName(choice, 'element')
        if (firstEl) {
            result.push(firstEl)
            return
        }
        const firstGroup = firstChildByLocalName(choice, 'group')
        if (firstGroup) this.followGroupRef(firstGroup, result, visited, true)
    }

    private followGroupRef(
        groupNode: Element,
        result: Element[],
        visited: Set<string>,
        firstOnly: boolean,
    ): void {
        const ref = groupNode.getAttribute('ref')
        if (!ref) return
        const name = stripNsPrefix(ref)
        if (visited.has(name)) return
        visited.add(name)
        const group = this.index.groupMap.get(name)
        if (group) this.collectElements(group, result, visited, firstOnly)
    }

    // ─── Attribute traversal ──────────────────────────────────────────────────

    private collectAttributes(node: Element): Element[] {
        const result: Element[] = []
        for (const child of directChildElements(node)) {
            switch (child.localName) {
                case 'attribute':
                    result.push(child)
                    break
                case 'simpleContent':
                case 'complexContent':
                case 'extension':
                case 'restriction':
                    result.push(...this.collectAttributes(child))
                    break
                case 'attributeGroup': {
                    const ref = child.getAttribute('ref')
                    if (ref) result.push(...this.attributesFromGroup(stripNsPrefix(ref)))
                    break
                }
            }
        }
        return result
    }

    private attributesFromGroup(groupName: string): Element[] {
        const group = this.index.attributeGroupMap.get(groupName)
        return group ? this.collectAttributes(group) : []
    }

    // ─── Enum extraction ──────────────────────────────────────────────────────

    private enumsFromInlineSimpleType(attrEl: Element): string[] {
        const st = firstChildByLocalName(attrEl, 'simpleType')
        return st ? this.enumsFromSimpleType(st) : []
    }

    private enumsFromSimpleType(simpleType: Element): string[] {
        const restriction = firstChildByLocalName(simpleType, 'restriction')
        if (!restriction) return []
        return directChildElements(restriction)
            .filter(el => el.localName === 'enumeration')
            .map(el => el.getAttribute('value') ?? '')
            .filter(v => v !== '')
    }

    private patternFromAttr(attrEl: Element): string | undefined {
        const inline = firstChildByLocalName(attrEl, 'simpleType')
        if (inline) {
            const p = this.patternFromSimpleType(inline)
            if (p !== undefined) return p
        }
        const typeName = attrEl.getAttribute('type')
        if (typeName) {
            const named = this.index.simpleTypeMap.get(stripNsPrefix(typeName))
            if (named) return this.patternFromSimpleType(named)
        }
        return undefined
    }

    private patternFromSimpleType(simpleType: Element): string | undefined {
        const restriction = firstChildByLocalName(simpleType, 'restriction')
        if (!restriction) return undefined
        const pattern = firstChildByLocalName(restriction, 'pattern')
        return pattern?.getAttribute('value') ?? undefined
    }

    // ─── Content model detection ──────────────────────────────────────────────

    private detectContentModel(node: Element): ContentModelType | null {
        for (const child of directChildElements(node)) {
            const ln = child.localName
            if (ln === 'sequence') return 'sequence'
            if (ln === 'choice') return 'choice'
            if (ln === 'all') return 'all'
            if (ln === 'simpleContent') return 'simpleContent'
            if (ln === 'complexContent' || ln === 'extension' || ln === 'restriction') {
                const inner = this.detectContentModel(child)
                if (inner) return inner
            }
        }
        return null
    }

    // ─── Element parsing ──────────────────────────────────────────────────────

    private parseElement(el: Element): DocumentNode {
        return {
            ...this.readAttributes(el),
            ...this.readDocumentation(el),
        }
    }

    private readAttributes(el: Element): Record<string, string> {
        const result: Record<string, string> = {}
        for (let i = 0; i < el.attributes.length; i++) {
            const attr = el.attributes[i]
            if (attr.name === 'xmlns' || attr.name.startsWith('xmlns:')) continue
            result[attr.localName ?? attr.name] = attr.value
        }
        return result
    }

    private readDocumentation(el: Element): { documentation: string } {
        const parts: string[] = []
        for (const child of directChildElements(el)) {
            if (child.localName !== 'annotation') continue
            const docNodes = child.getElementsByTagNameNS(XSD_NS, 'documentation')
            for (let i = 0; i < docNodes.length; i++) {
                const docEl = docNodes[i] as unknown as Element
                const text: string =
                    (docEl as unknown as { textContent?: string }).textContent ??
                    (docEl.firstChild as unknown as { data?: string } | null)?.data ??
                    ''
                if (text.trim()) parts.push(text.trim())
            }
        }
        return {
            documentation:
                parts.join('<br/><hr/><br/>') + `<br/>Source: ${this.index.xsd.path}`,
        }
    }

    // ─── Helpers ──────────────────────────────────────────────────────────────

    private complexTypeForElement(elementName: string): Element | undefined {
        const typeName = this.index.elementTypeMap.get(elementName)
        return typeName ? this.index.complexTypeMap.get(typeName) : undefined
    }

    private withRequiredAttributes(nodes: DocumentNode[]): DocumentNode[] {
        return nodes.map(node => {
            const name = node.name ?? node.ref
            if (!name) return node
            const ct = this.complexTypeForElement(name)
            if (!ct) return node

            const required = this.collectAttributes(ct)
                .filter(el => el.getAttribute('use') === 'required')
                .map(el => this.parseElement(el))

            if (required.length > 0) node.requiredAttribute = required

            // Mark as self-closing when the element has no child-element content:
            // covers xs:simpleContent (text value + attrs) and bare attribute-only
            // complexTypes (no sequence/choice/all/complexContent present).
            const hasElementChildren =
                firstChildByLocalName(ct, 'sequence') !== null ||
                firstChildByLocalName(ct, 'choice') !== null ||
                firstChildByLocalName(ct, 'all') !== null ||
                firstChildByLocalName(ct, 'complexContent') !== null
            if (!hasElementChildren) node.selfClose = true

            return node
        })
    }
}
