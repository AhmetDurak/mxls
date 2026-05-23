import { DOMParser, MIME_TYPE } from '@xmldom/xmldom'
import type { IXsd } from '../types'

export const XSD_NS = 'http://www.w3.org/2001/XMLSchema'

/** Container node local-names that are transparent during element traversal. */
export const CONTAINER_LOCAL_NAMES = new Set([
    'sequence',
    'all',
    'complexContent',
    'extension',
    'restriction',
])

/**
 * Builds lookup maps from an XSD DOM at construction time.
 * All maps are populated once and never mutated afterwards.
 */
export class SchemaIndex {
    readonly doc: Document
    readonly xsd: IXsd

    /** Named xs:complexType nodes, keyed by @name.
     *  Inline anonymous types are stored under `__inline__<elementName>`. */
    readonly complexTypeMap = new Map<string, Element>()

    /** Named xs:attributeGroup nodes, keyed by @name. */
    readonly attributeGroupMap = new Map<string, Element>()

    /** Named xs:group nodes, keyed by @name. */
    readonly groupMap = new Map<string, Element>()

    /** Named xs:simpleType nodes, keyed by @name. */
    readonly simpleTypeMap = new Map<string, Element>()

    /**
     * Primary type lookup: element name → one type name.
     * Last-write-wins when the same element name appears more than once.
     * Priority: @type attr > extension @base > `__inline__<name>`.
     */
    readonly elementTypeMap = new Map<string, string>()

    /**
     * Multi-value type lookup: element name → all distinct type names.
     * Used for union fallback when context-aware resolution fails.
     */
    readonly elementTypesMultiMap = new Map<string, Set<string>>()

    constructor(xsd: IXsd) {
        this.xsd = xsd
        this.doc = new DOMParser().parseFromString(
            xsd.value.trim(),
            MIME_TYPE.XML_TEXT,
        ) as unknown as Document
        this.buildMaps()
    }

    // ─── private helpers ──────────────────────────────────────────────────────

    private buildMaps(): void {
        this.indexNamed('complexType', this.complexTypeMap)
        this.indexNamed('attributeGroup', this.attributeGroupMap)
        this.indexNamed('group', this.groupMap)
        this.indexNamed('simpleType', this.simpleTypeMap)
        this.indexElements()
    }

    /** Finds all xs:<localName> nodes with a @name attribute and adds them to the map. */
    private indexNamed(localName: string, map: Map<string, Element>): void {
        const nodes = this.doc.getElementsByTagNameNS(XSD_NS, localName)
        for (let i = 0; i < nodes.length; i++) {
            const el = nodes[i] as unknown as Element
            const name = el.getAttribute('name')
            if (name) map.set(name, el)
        }
    }

    /** Walks every xs:element in the document and populates element type maps. */
    private indexElements(): void {
        const nodes = this.doc.getElementsByTagNameNS(XSD_NS, 'element')
        for (let i = 0; i < nodes.length; i++) {
            this.indexOneElement(nodes[i] as unknown as Element)
        }
    }

    private indexOneElement(el: Element): void {
        const name = el.getAttribute('name')
        if (!name) return

        // Priority 1: explicit @type attribute
        const typeAttr = el.getAttribute('type')
        if (typeAttr) {
            const typeName = stripNsPrefix(typeAttr)
            this.elementTypeMap.set(name, typeName)
            this.addToMultiMap(name, typeName)
            return
        }

        // Priority 2: extension @base (inline complexType that extends another type)
        const extensionBase = this.readExtensionBase(el)
        if (extensionBase) {
            const typeName = stripNsPrefix(extensionBase)
            this.elementTypeMap.set(name, typeName)
            this.addToMultiMap(name, typeName)
            return
        }

        // Priority 3: anonymous inline complexType
        const inlineCT = firstChildByLocalName(el, 'complexType')
        if (inlineCT && !this.elementTypeMap.has(name)) {
            const key = `__inline__${name}`
            this.complexTypeMap.set(key, inlineCT)
            this.elementTypeMap.set(name, key)
            this.addToMultiMap(name, key)
        }
    }

    private addToMultiMap(name: string, typeName: string): void {
        let set = this.elementTypesMultiMap.get(name)
        if (!set) {
            set = new Set()
            this.elementTypesMultiMap.set(name, set)
        }
        set.add(typeName)
    }

    /**
     * Checks whether an xs:element hosts an inline complexType that wraps a
     * complexContent/extension, and if so returns the extension's @base value.
     */
    private readExtensionBase(el: Element): string | null {
        const ct = firstChildByLocalName(el, 'complexType')
        if (!ct) return null
        const cc = firstChildByLocalName(ct, 'complexContent')
        if (!cc) return null
        const ext = firstChildByLocalName(cc, 'extension')
        return ext ? ext.getAttribute('base') : null
    }
}

// ─── pure helpers (module-private) ───────────────────────────────────────────

/** Returns the first direct child Element with a matching localName, or null. */
export function firstChildByLocalName(parent: Element, localName: string): Element | null {
    for (let i = 0; i < parent.childNodes.length; i++) {
        const node = parent.childNodes[i] as Element
        if (node.nodeType === 1 && node.localName === localName) return node
    }
    return null
}

/** Returns all direct child Elements of a node. */
export function directChildElements(parent: Element): Element[] {
    const result: Element[] = []
    for (let i = 0; i < parent.childNodes.length; i++) {
        const node = parent.childNodes[i] as Element
        if (node.nodeType === 1) result.push(node)
    }
    return result
}

/** Returns all direct child Elements with a given localName. */
export function childrenByLocalName(parent: Element, localName: string): Element[] {
    return directChildElements(parent).filter(el => el.localName === localName)
}

/** Strips an XML namespace prefix ("xs:string" → "string"). */
export function stripNsPrefix(value: string): string {
    const idx = value.indexOf(':')
    return idx === -1 ? value : value.slice(idx + 1)
}
