export function stripNsPrefix(tag: string): string {
    const colon = tag.indexOf(':')
    return colon >= 0 ? tag.slice(colon + 1) : tag
}

export function getMatchesForRegex(text: string, regex: RegExp): string[] {
    const global = new RegExp(
        regex.source,
        regex.flags.includes('g') ? regex.flags : regex.flags + 'g',
    )
    const results: string[] = []
    let match: RegExpExecArray | null
    while ((match = global.exec(text)) !== null) {
        results.push(match[0])
    }
    return results
}

/** Returns the local name of the document's root element (strips namespace prefix). */
export function getRootTag(xmlText: string): string | undefined {
    const cleaned = xmlText
        .replace(/<\?[\s\S]*?\?>/g, '')
        .replace(/<!--[\s\S]*?-->/g, '')
    const match = /<([a-zA-Z_][\w:.-]*)[\s\/>]/.exec(cleaned)
    return match ? stripNsPrefix(match[1]) : undefined
}

/**
 * Returns the stack of tag names that are opened but not yet closed in `text`.
 * Namespace prefixes are preserved — strip them with stripNsPrefix if needed.
 *
 * NOTE: attribute values must not contain literal `>` (use `&gt;` instead).
 * This is required by the XML spec and assumed here for regex-based matching.
 */
export function getUnclosedTags(text: string): string[] {
    const cleaned = text
        .replace(/<!--[\s\S]*?-->/g, '')
        .replace(/<\?[\s\S]*?\?>/g, '')
        .replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, '')
        .replace(/<!DOCTYPE[^>]*>/gi, '')

    // Groups: [1] '/' for closing | '' for opening  [2] tag name  [3] '/>' for self-close
    const tagRe = /<(\/?)([a-zA-Z_][\w:.-]*)(?:\s[^>]*)?(\/?)>/g
    const stack: string[] = []
    let match: RegExpExecArray | null

    while ((match = tagRe.exec(cleaned)) !== null) {
        const isClosing = match[1] === '/'
        const name = match[2]
        const isSelfClosing = match[3] === '/'

        if (isClosing) {
            const idx = stack.lastIndexOf(name)
            if (idx >= 0) stack.splice(idx, 1)
        } else if (!isSelfClosing) {
            stack.push(name)
        }
    }

    return stack
}

/** Returns the attribute names already present in the current opening tag. */
export function extractUsedAttributes(textUntilCursor: string): string[] {
    const lastOpen = textUntilCursor.lastIndexOf('<')
    if (lastOpen < 0) return []
    const inTag = textUntilCursor.slice(lastOpen)
    const attrRe = /\s([a-zA-Z_][\w:.-]*)=/g
    const used: string[] = []
    let match: RegExpExecArray | null
    while ((match = attrRe.exec(inTag)) !== null) {
        used.push(match[1])
    }
    return used
}

/**
 * Returns the name of the attribute whose value the cursor is currently inside,
 * or null if the cursor is not inside an attribute value.
 */
export function extractCurrentAttributeName(textUntilCursor: string): string | null {
    const lastOpen = textUntilCursor.lastIndexOf('<')
    if (lastOpen < 0) return null
    const inTag = textUntilCursor.slice(lastOpen)
    const dq = /\s([a-zA-Z_][\w:.-]*)="[^"]*$/.exec(inTag)
    const sq = /\s([a-zA-Z_][\w:.-]*)='[^']*$/.exec(inTag)
    if (dq && sq) return dq.index > sq.index ? dq[1] : sq[1]
    return dq?.[1] ?? sq?.[1] ?? null
}
