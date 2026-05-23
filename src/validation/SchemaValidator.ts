import { DOMParser, MIME_TYPE } from '@xmldom/xmldom'
import type { ISchemaWorker } from '../interfaces/ISchemaWorker'
import { ContentModelType, Severity, type ValidationError } from '../types'
import { stripNsPrefix } from '../utils/XmlTextUtils'

// ─── xmldom extension types ───────────────────────────────────────────────────

interface LocatedNode extends Node {
    lineNumber?: number
    columnNumber?: number
}

interface ErrorContext {
    locator?: {
        lineNumber?: number
        columnNumber?: number
    }
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

const VALID_BOOLEANS = new Set(['true', 'false', '1', '0'])

function nodeLocation(node: LocatedNode): { line: number; col: number } {
    return {
        line: node.lineNumber ?? 1,
        col: node.columnNumber ?? 1,
    }
}

/** Cast a Node to Element so we can call getAttribute / localName etc. */
function asElement(node: Node): Element | null {
    if (node.nodeType === 1 /* ELEMENT_NODE */) return node as unknown as Element
    return null
}

/** Collect all element nodes in document order (depth-first). */
function collectAllElements(root: Element): Element[] {
    const result: Element[] = []
    const walk = (el: Element): void => {
        result.push(el)
        for (let i = 0; i < el.childNodes.length; i++) {
            const child = el.childNodes[i]
            const childEl = asElement(child)
            if (childEl) walk(childEl)
        }
    }
    walk(root)
    return result
}

/** Children that are element nodes. */
function childElements(el: Element): Element[] {
    const result: Element[] = []
    for (let i = 0; i < el.childNodes.length; i++) {
        const child = asElement(el.childNodes[i])
        if (child) result.push(child)
    }
    return result
}

/** Deduplicate key: `line:col:severity:message60` */
function dedupKey(e: ValidationError): string {
    return `${e.line}:${e.col}:${e.severity}:${e.message.slice(0, 60)}`
}

/**
 * Find the first worker that recognises `localName` as a root or sub-element
 * of `parentLocalName`. Returns null when no worker owns the element.
 */
function findWorkerForElement(
    localName: string,
    parentLocalName: string | null,
    workers: ISchemaWorker[],
): ISchemaWorker | null {
    for (const w of workers) {
        if (parentLocalName === null) {
            // root level
            const roots = w.getRootElements()
            if (roots.some(r => r.name === localName)) return w
        } else {
            const subs = w.getSubElements(parentLocalName)
            if (subs.some(s => s.name === localName)) return w
        }
    }
    return null
}

// ─── SchemaValidator ─────────────────────────────────────────────────────────

/**
 * Pure validator: no Monaco dependency, fully testable in Node.
 * Returns a deduplicated array of ValidationError for the given XML string
 * checked against all provided schema workers.
 */
export class SchemaValidator {
    validate(xml: string, workers: ISchemaWorker[]): ValidationError[] {
        const errors: ValidationError[] = []

        // ── 1. XML parse errors ───────────────────────────────────────────────
        let parseErrors: ValidationError[] = []
        const parser = new DOMParser({
            onError: (
                level: 'warning' | 'error' | 'fatalError',
                msg: string,
                context: unknown,
            ) => {
                const ctx = context as ErrorContext | undefined
                const line = ctx?.locator?.lineNumber ?? 1
                const col = ctx?.locator?.columnNumber ?? 1
                parseErrors.push({
                    line,
                    col,
                    message: msg,
                    severity:
                        level === 'warning'
                            ? Severity.warning
                            : level === 'fatalError'
                              ? Severity.fatalError
                              : Severity.error,
                })
            },
        })

        const doc = parser.parseFromString(xml, MIME_TYPE.XML_TEXT)
        errors.push(...parseErrors)

        // If we have fatal errors or no root, structural validation is impossible
        const docRoot = doc.documentElement as unknown as Element | null
        if (!docRoot || parseErrors.some(e => e.severity === Severity.fatalError)) {
            return this.deduplicate(errors)
        }

        // ── Walk every element node ────────────────────────────────────────────
        const allElements = collectAllElements(docRoot)

        for (const el of allElements) {
            const located = el as unknown as LocatedNode
            const { line, col } = nodeLocation(located)
            const localName = stripNsPrefix(el.localName ?? el.nodeName)

            // Determine parent local name
            const parentNode = el.parentNode
            const parentEl = parentNode ? asElement(parentNode) : null
            const parentLocalName = parentEl
                ? stripNsPrefix(parentEl.localName ?? parentEl.nodeName)
                : null

            // Find the worker that owns this element
            const ownerWorker = findWorkerForElement(localName, parentLocalName, workers)

            // ── 2. Unknown element ─────────────────────────────────────────────
            if (workers.length > 0) {
                if (parentLocalName === null) {
                    // Root element: must be in at least one worker's root elements
                    const knownRoot = workers.some(w =>
                        w.getRootElements().some(r => r.name === localName),
                    )
                    if (!knownRoot) {
                        errors.push({
                            line,
                            col,
                            message: `Unknown root element <${localName}>`,
                            severity: Severity.error,
                        })
                    }
                } else {
                    // Child element: must be in parent's sub-elements for at least one worker
                    const knownChild = workers.some(w =>
                        w.getSubElements(parentLocalName).some(s => s.name === localName),
                    )
                    if (!knownChild) {
                        errors.push({
                            line,
                            col,
                            message: `Unknown element <${localName}> inside <${parentLocalName}>`,
                            severity: Severity.error,
                        })
                    }
                }
            }

            if (!ownerWorker) continue

            const definedAttrs = ownerWorker.getAttributesForElement(localName)

            // ── 3. Missing required attributes ────────────────────────────────
            for (const attrDef of definedAttrs) {
                if (attrDef.use === 'required' && attrDef.name) {
                    if (!el.hasAttribute(attrDef.name)) {
                        errors.push({
                            line,
                            col,
                            message: `Required attribute "${attrDef.name}" is missing on <${localName}>`,
                            severity: Severity.error,
                        })
                    }
                }
            }

            // ── 4–6. Attribute-level checks ───────────────────────────────────
            const attrMap = el.attributes
            for (let i = 0; attrMap && i < attrMap.length; i++) {
                const attr = attrMap[i]
                const attrName = stripNsPrefix(attr.name)
                const attrValue = attr.value

                // Skip xmlns declarations
                if (attr.name.startsWith('xmlns') || attr.name === 'xmlns') continue

                // ── 4. Unknown attribute ───────────────────────────────────────
                const knownAttr = definedAttrs.some(a => a.name === attrName)
                if (!knownAttr && definedAttrs.length > 0) {
                    errors.push({
                        line,
                        col,
                        message: `Unknown attribute "${attrName}" on <${localName}>`,
                        severity: Severity.error,
                    })
                    continue
                }

                const attrDef = definedAttrs.find(a => a.name === attrName)
                if (!attrDef) continue

                // ── 5. Invalid boolean ─────────────────────────────────────────
                if (attrDef.type === 'xs:boolean') {
                    if (!VALID_BOOLEANS.has(attrValue)) {
                        errors.push({
                            line,
                            col,
                            message: `Attribute "${attrName}" on <${localName}> must be a boolean (true/false/1/0), got "${attrValue}"`,
                            severity: Severity.error,
                        })
                    }
                    continue
                }

                // ── 6. Invalid enum value ──────────────────────────────────────
                const enumValues = ownerWorker.getEnumValuesForAttribute(localName, attrName)
                if (enumValues.length > 0 && !enumValues.includes(attrValue)) {
                    errors.push({
                        line,
                        col,
                        message: `Invalid value "${attrValue}" for attribute "${attrName}" on <${localName}>. Allowed: ${enumValues.join(', ')}`,
                        severity: Severity.error,
                    })
                }
            }

            // ── 7–9. Child occurrence / content-model checks ──────────────────
            const children = childElements(el)
            const contentModel = ownerWorker.getContentModelType(localName)

            // ── 9. Empty choice ────────────────────────────────────────────────
            if (contentModel === ContentModelType.choice && children.length === 0) {
                errors.push({
                    line,
                    col,
                    message: `Element <${localName}> uses xs:choice but has no children`,
                    severity: Severity.error,
                })
            }

            const subDefs = ownerWorker.getSubElements(localName)
            if (subDefs.length === 0) continue

            // Count child occurrences
            const childCountMap = new Map<string, number>()
            for (const child of children) {
                const childName = stripNsPrefix(child.localName ?? child.nodeName)
                childCountMap.set(childName, (childCountMap.get(childName) ?? 0) + 1)
            }

            for (const subDef of subDefs) {
                if (!subDef.name) continue
                const count = childCountMap.get(subDef.name) ?? 0

                // ── 7. maxOccurs exceeded ──────────────────────────────────────
                if (subDef.maxOccurs !== undefined && subDef.maxOccurs !== 'unbounded') {
                    const max = parseInt(subDef.maxOccurs, 10)
                    if (!isNaN(max) && count > max) {
                        errors.push({
                            line,
                            col,
                            message: `Element <${subDef.name}> appears ${count} time(s) inside <${localName}> but maxOccurs is ${max}`,
                            severity: Severity.error,
                        })
                    }
                }

                // ── 8. minOccurs violated (sequence / all only) ────────────────
                if (
                    contentModel === ContentModelType.sequence ||
                    contentModel === ContentModelType.all
                ) {
                    const minStr = subDef.minOccurs ?? '1'
                    const min = parseInt(minStr, 10)
                    if (!isNaN(min) && min > 0 && count < min) {
                        errors.push({
                            line,
                            col,
                            message: `Required child <${subDef.name}> is missing inside <${localName}> (minOccurs=${min})`,
                            severity: Severity.error,
                        })
                    }
                }
            }
        }

        return this.deduplicate(errors)
    }

    private deduplicate(errors: ValidationError[]): ValidationError[] {
        const seen = new Set<string>()
        return errors.filter(e => {
            const key = dedupKey(e)
            if (seen.has(key)) return false
            seen.add(key)
            return true
        })
    }
}
