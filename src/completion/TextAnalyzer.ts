import { CompletionType } from '../types'
import { getUnclosedTags, stripNsPrefix } from '../utils/XmlTextUtils'

export interface CursorContext {
    completionType: CompletionType
    /** The innermost open tag the cursor is inside of (or typing into). */
    parentTag: string
    /** Ancestors of parentTag, outermost first. */
    ancestorChain: string[]
}

interface ScanResult {
    lastOpenBracket: number
    lastCloseBracket: number
    /** True when cursor is inside an unclosed attribute value quote. */
    inString: boolean
}

function scanBrackets(text: string): ScanResult {
    let inStr: string | null = null
    let lastOpenBracket = -1
    let lastCloseBracket = -1

    for (let i = 0; i < text.length; i++) {
        const ch = text[i]
        if (inStr !== null) {
            if (ch === inStr) inStr = null
        } else if (ch === '"' || ch === "'") {
            inStr = ch
        } else if (ch === '<') {
            lastOpenBracket = i
        } else if (ch === '>') {
            lastCloseBracket = i
        }
    }

    return { lastOpenBracket, lastCloseBracket, inString: inStr !== null }
}

function toLocalNames(tags: string[]): string[] {
    return tags.map(stripNsPrefix)
}

/**
 * Analyzes the text from document start to the cursor position and returns
 * the completion context: what kind of completion is needed, what is the
 * parent element, and the full ancestor chain.
 */
export function analyzeContext(text: string): CursorContext {
    const { lastOpenBracket, lastCloseBracket, inString } = scanBrackets(text)
    const insideTag =
        lastOpenBracket !== -1 && lastOpenBracket > lastCloseBracket

    // ── Attribute value ────────────────────────────────────────────────────────
    if (inString) {
        const beforeOpen = text.slice(0, lastOpenBracket)
        const inside = text.slice(lastOpenBracket + 1)
        const tagName = /^([a-zA-Z_][\w:.-]*)/.exec(inside)?.[1] ?? ''
        const ancestors = toLocalNames(getUnclosedTags(beforeOpen))
        return {
            completionType: CompletionType.attributeValue,
            parentTag: stripNsPrefix(tagName),
            ancestorChain: ancestors,
        }
    }

    // ── Between tags (element completion) ──────────────────────────────────────
    if (!insideTag) {
        const unclosed = toLocalNames(getUnclosedTags(text))
        return {
            completionType: CompletionType.element,
            parentTag: unclosed[unclosed.length - 1] ?? '',
            ancestorChain: unclosed.slice(0, -1),
        }
    }

    // ── Inside an unclosed '<…' ────────────────────────────────────────────────
    const inside = text.slice(lastOpenBracket + 1)
    const beforeOpen = text.slice(0, lastOpenBracket)

    // Closing tag: '</'
    if (inside.startsWith('/')) {
        const unclosed = toLocalNames(getUnclosedTags(text))
        return {
            completionType: CompletionType.closingElement,
            parentTag: unclosed[unclosed.length - 1] ?? '',
            ancestorChain: unclosed.slice(0, -1),
        }
    }

    const tagName = /^([a-zA-Z_][\w:.-]*)/.exec(inside)?.[1] ?? ''
    // Still typing the element name when there is no whitespace after '<' (or '<' alone)
    const hasSpaceAfterName = /^(?:[a-zA-Z_][\w:.-]*)?\s/.test(inside)

    if (!hasSpaceAfterName) {
        const ancestors = toLocalNames(getUnclosedTags(beforeOpen))
        return {
            completionType: CompletionType.incompleteElement,
            parentTag: ancestors[ancestors.length - 1] ?? '',
            ancestorChain: ancestors.slice(0, -1),
        }
    }

    // Inside the attributes region of a tag
    const ancestors = toLocalNames(getUnclosedTags(beforeOpen))
    return {
        completionType: CompletionType.incompleteAttribute,
        parentTag: stripNsPrefix(tagName),
        ancestorChain: ancestors,
    }
}

export function getCompletionType(text: string): CompletionType {
    return analyzeContext(text).completionType
}

export function getParentTag(text: string): string {
    return analyzeContext(text).parentTag
}

export function getAncestorChain(text: string): string[] {
    return analyzeContext(text).ancestorChain
}

export function isInsideOpenTag(text: string): boolean {
    const t = getCompletionType(text)
    return t === CompletionType.incompleteAttribute || t === CompletionType.attributeValue
}
