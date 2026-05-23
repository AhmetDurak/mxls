import type { ICompletion } from '../types'
import { CompletionType } from '../types'

/** Memoizes completion results by context key: `type:ancestor>…>parent`. */
export class CompletionCache {
    private readonly cache = new Map<string, ICompletion[]>()

    makeKey(completionType: CompletionType, parentTag: string, ancestorChain: string[]): string {
        return `${completionType}:${ancestorChain.join('>')}>${parentTag}`
    }

    get(key: string): ICompletion[] | undefined {
        return this.cache.get(key)
    }

    set(key: string, completions: ICompletion[]): void {
        this.cache.set(key, completions)
    }

    clear(): void {
        this.cache.clear()
    }
}
