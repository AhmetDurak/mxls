import type { ISchemaRegistry } from '../interfaces/ISchemaRegistry'
import type { ISchemaWorker } from '../interfaces/ISchemaWorker'
import type { INamespaceInfo } from '../types'

export interface WorkerWithPrefix {
    worker: ISchemaWorker
    prefix: string
}

/** Instance-based (no static state) xmlns extraction and worker selection. */
export class NamespaceResolver {
    /** Extracts all xmlns declarations from the XML text. */
    extractNamespaces(xmlText: string): INamespaceInfo[] {
        const results: INamespaceInfo[] = []
        // Matches xmlns="uri" and xmlns:prefix="uri"
        const nsRe = /xmlns(?::([a-zA-Z_][\w.-]*))?="([^"]+)"/g
        let match: RegExpExecArray | null
        while ((match = nsRe.exec(xmlText)) !== null) {
            results.push({ prefix: match[1] ?? '', path: match[2] })
        }
        return results
    }

    /**
     * Resolves the workers that apply to the current document.
     * Workers are matched by namespace URI (exact then non-strict path lookup).
     * Always-included and root-tag-matched workers are appended if not already present.
     */
    getActiveWorkers(
        xmlText: string,
        manager: ISchemaRegistry,
        rootTag: string | undefined,
    ): WorkerWithPrefix[] {
        const result: WorkerWithPrefix[] = []
        const seenPaths = new Set<string>()

        for (const ns of this.extractNamespaces(xmlText)) {
            const worker = manager.get(ns.path) ?? manager.getNonStrict(ns.path)
            if (worker && !seenPaths.has(worker.xsd.path)) {
                seenPaths.add(worker.xsd.path)
                result.push({ worker, prefix: ns.prefix })
            }
        }

        for (const worker of manager.getAlwaysIncludedWorkers(rootTag)) {
            if (!seenPaths.has(worker.xsd.path)) {
                seenPaths.add(worker.xsd.path)
                result.push({ worker, prefix: '' })
            }
        }

        return result
    }
}
