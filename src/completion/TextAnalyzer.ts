import { CompletionType } from '../types'
import {
    getUnclosedTags,
    stripNsPrefix,
    extractCurrentAttributeName,
} from '../utils/XmlTextUtils'

// ─── Internal bracket scan ────────────────────────────────────────────────────

interface Scan {
    lastOpen: number
    lastClose: number
    inString: boolean
}

function scan(text: string): Scan {
    let inStr: string | null = null
    let lastOpen = -1
    let lastClose = -1

    for (let i = 0; i < text.length; i++) {
        const ch = text[i]
        if (inStr !== null) {
            if (ch === inStr) inStr = null
        } else if (ch === '"' || ch === "'") {
            inStr = ch
        } else if (ch === '<') {
            lastOpen = i
        } else if (ch === '>') {
            lastClose = i
        }
    }

    return { lastOpen, lastClose, inString: inStr !== null }
}

function deriveType(text: string): CompletionType {
    const { lastOpen, lastClose, inString } = scan(text)

    if (inString) return CompletionType.attributeValue

    const insideTag = lastOpen !== -1 && lastOpen > lastClose
    if (!insideTag) return CompletionType.element

    const inside = text.slice(lastOpen + 1)
    if (inside.startsWith('/')) return CompletionType.closingElement

    const hasSpaceAfterName = /^(?:[a-zA-Z_][\w:.-]*)?\s/.test(inside)
    if (!hasSpaceAfterName) return CompletionType.incompleteElement

    return CompletionType.incompleteAttribute
}

// ─── TextAnalyzer ─────────────────────────────────────────────────────────────

/** Pure cursor-context analyzer — zero Monaco imports. */
export class TextAnalyzer {
    /**
     * Returns the completion type appropriate for the given text and Monaco
     * trigger information.  `triggerKind` 1 = triggerCharacter; 0 = Invoke.
     */
    getCompletionType(
        text: string,
        triggerKind: number,
        triggerChar?: string,
    ): CompletionType {
        if (triggerKind === 1 && triggerChar) {
            switch (triggerChar) {
                case '<':
                    return text.trimEnd().endsWith('</')
                        ? CompletionType.closingElement
                        : CompletionType.element
                case '/':
                    return CompletionType.closingElement
                case '=':
                case '"':
                case "'":
                    return CompletionType.attributeValue
                case ' ':
                    return CompletionType.incompleteAttribute
            }
        }
        return deriveType(text)
    }

    /** Innermost unclosed element name (NS-stripped), or undefined. */
    getParentTag(text: string): string | undefined {
        const tags = this.getUnclosedTags(text)
        const last = tags[tags.length - 1]
        return last ? stripNsPrefix(last) : undefined
    }

    /**
     * All unclosed tags minus the innermost, with namespace prefix stripped.
     * Represents the ancestor chain of the element being edited.
     */
    getAncestorChain(text: string): string[] {
        const tags = this.getUnclosedTags(text)
        return tags.slice(0, -1).map(stripNsPrefix)
    }

    /** Full NS-prefixed unclosed-tag stack (as returned by XML text utils). */
    getUnclosedTags(text: string): string[] {
        return getUnclosedTags(text)
    }

    isInsideOpenTag(text: string): boolean {
        const t = deriveType(text)
        return t === CompletionType.incompleteAttribute || t === CompletionType.attributeValue
    }

    /** Returns the attribute name whose value the cursor is currently inside. */
    getAttrNameBeforeCursor(text: string): string | undefined {
        return extractCurrentAttributeName(text) ?? undefined
    }

    /**
     * Counts how many times `childTag` appears as a direct child of the current
     * open `parentTag` scope (best-effort approximation based on text).
     */
    countChildOccurrences(text: string, parentTag: string, childTag: string): number {
        const lastParentOpen = text.lastIndexOf(`<${parentTag}`)
        if (lastParentOpen < 0) return 0
        const scope = text.slice(lastParentOpen)
        const escaped = childTag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        const re = new RegExp(`<${escaped}[\\s>\/]`, 'g')
        return (scope.match(re) ?? []).length
    }
}
