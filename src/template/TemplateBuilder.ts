import type { DocumentNode } from '../types'
import type { ISchemaWorker } from '../interfaces/ISchemaWorker'

export class TemplateBuilder {
    /**
     * Build an XML skeleton for `rootTag` up to `level` nesting depth.
     * Searches `workers` for the schema that declares `rootTag` as a root element.
     */
    buildFromRoot(
        rootTag: string,
        level: number,
        withAttributes: boolean,
        workers: ISchemaWorker[],
    ): string {
        const worker = workers.find(w =>
            w.getRootElements().some(n => n.name === rootTag),
        )
        if (!worker) return `<${rootTag}/>`

        const resolver = (name: string): ISchemaWorker | undefined =>
            workers.find(w => w.getFirstSubElements(name, false).length > 0)

        return this.buildNode(rootTag, 0, level, withAttributes, worker, resolver)
    }

    /**
     * Build an XML skeleton starting from a DocumentNode.
     * `resolver` maps element names to the worker that owns them.
     * Returns undefined if `model.name` is missing or no worker is found.
     */
    generateFromModel(
        model: DocumentNode,
        level: number,
        withAttributes: boolean,
        resolver: (name: string) => ISchemaWorker | undefined,
    ): string | undefined {
        if (!model.name) return undefined
        const worker = resolver(model.name)
        if (!worker) return undefined
        return this.buildNode(model.name, 0, level, withAttributes, worker, resolver)
    }

    private buildNode(
        name: string,
        depth: number,
        maxDepth: number,
        withAttributes: boolean,
        worker: ISchemaWorker,
        resolver: (name: string) => ISchemaWorker | undefined,
    ): string {
        const indent = '  '.repeat(depth)
        const attrs = this.serializeAttrs(name, withAttributes, worker)

        if (depth >= maxDepth) {
            return `${indent}<${name}${attrs}/>`
        }

        const children = worker.getFirstSubElements(name, withAttributes)
        const childNames = children.filter(c => !!c.name)

        if (childNames.length === 0) {
            return `${indent}<${name}${attrs}/>`
        }

        const childLines = childNames.map(child => {
            const childWorker = resolver(child.name!) ?? worker
            return this.buildNode(child.name!, depth + 1, maxDepth, withAttributes, childWorker, resolver)
        })

        return [`${indent}<${name}${attrs}>`, ...childLines, `${indent}</${name}>`].join('\n')
    }

    private serializeAttrs(
        name: string,
        withAttributes: boolean,
        worker: ISchemaWorker,
    ): string {
        if (!withAttributes) return ''
        const required = worker
            .getAttributesForElement(name)
            .filter(a => a.use === 'required' && !!a.name)
        return required.map(a => ` ${a.name}=""`).join('')
    }
}
