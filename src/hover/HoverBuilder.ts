import TurndownService from 'turndown'
import type { IMarkdownString } from 'monaco-editor'
import type { DocumentNode } from '../types'

const td = new TurndownService()

function toMarkdown(raw: string | undefined): string | undefined {
    if (!raw) return undefined
    return /<[a-z][\s\S]*>/i.test(raw) ? td.turndown(raw) : raw
}

/** Builds Monaco IMarkdownString hover content from schema DocumentNode data. */
export class HoverBuilder {
    buildForElement(node: DocumentNode): IMarkdownString | undefined {
        const md = toMarkdown(node.documentation)
        if (!md && !node.type) return undefined
        const header = `**\`${node.name ?? ''}\`**${node.type ? ` *(${node.type})*` : ''}`
        return { value: md ? `${header}\n\n${md}` : header }
    }

    buildForAttribute(node: DocumentNode): IMarkdownString | undefined {
        const md = toMarkdown(node.documentation)
        const requiredMark = node.use === 'required' ? ' — **required**' : ''
        const typeMark = node.type ? ` *(${node.type})*` : ''
        if (!md && !node.type && !node.use) return undefined
        const header = `**\`@${node.name ?? ''}\`**${typeMark}${requiredMark}`
        return { value: md ? `${header}\n\n${md}` : header }
    }
}
