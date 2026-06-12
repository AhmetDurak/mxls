import type { IMonacoApi, ICodeEditorModel, IModelDecoration } from '../interfaces/IMonacoApi'
import { Severity, type ValidationError } from '../types'

/**
 * Maps ValidationError[] → Monaco decoration objects.
 * Receives IMonacoApi at construction — never touches window.monaco.
 */
export class DecorationMapper {
    constructor(private readonly monacoApi: IMonacoApi) {}

    toDecorations(
        errors: ValidationError[],
        model: ICodeEditorModel,
    ): IModelDecoration[] {
        return errors.map(error => {
            const lineCount = model.getLineCount()
            const safeLine = Math.max(1, Math.min(error.line, lineCount))
            const endColumn = model.getLineMaxColumn(safeLine)
            const startColumn = Math.max(1, error.col)

            const range = new this.monacoApi.Range(
                safeLine,
                startColumn,
                safeLine,
                endColumn,
            )

            const className = this.cssClass(error.severity)
            const hoverMessage = { value: error.message }

            return {
                range,
                options: {
                    isWholeLine: false,
                    className,
                    hoverMessage,
                    overviewRuler: {
                        color: this.overviewColor(error.severity),
                        position: 4 /* OverviewRulerLane.Right */,
                    },
                    minimap: {
                        color: this.overviewColor(error.severity),
                        position: 1 /* MinimapPosition.Inline */,
                    },
                },
            } satisfies IModelDecoration
        })
    }

    private cssClass(severity: Severity): string {
        switch (severity) {
            case Severity.warning:
                return 'mxls-warning-decoration'
            case Severity.fatalError:
                return 'mxls-fatal-decoration'
            default:
                return 'mxls-error-decoration'
        }
    }

    private overviewColor(severity: Severity): string {
        switch (severity) {
            case Severity.warning:
                return 'rgba(255, 200, 0, 0.8)'
            case Severity.fatalError:
                return 'rgba(200, 0, 0, 0.9)'
            default:
                return 'rgba(255, 50, 50, 0.8)'
        }
    }
}
