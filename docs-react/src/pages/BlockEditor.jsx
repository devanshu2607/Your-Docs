// BlockEditor.jsx — All bugs fixed (v3)
import { useEffect, useRef, useCallback, useState, useMemo } from 'react'
import { LexicalComposer }           from '@lexical/react/LexicalComposer'
import { RichTextPlugin }            from '@lexical/react/LexicalRichTextPlugin'
import { ContentEditable }           from '@lexical/react/LexicalContentEditable'
import { HistoryPlugin }             from '@lexical/react/LexicalHistoryPlugin'
import { OnChangePlugin }            from '@lexical/react/LexicalOnChangePlugin'
import { ListPlugin }                from '@lexical/react/LexicalListPlugin'
import { MarkdownShortcutPlugin }    from '@lexical/react/LexicalMarkdownShortcutPlugin'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { HeadingNode, QuoteNode }    from '@lexical/rich-text'
import { ListNode, ListItemNode }    from '@lexical/list'
import { CodeNode }                  from '@lexical/code'
import { LinkNode, AutoLinkNode }    from '@lexical/link'
import {
    HEADING, QUOTE, UNORDERED_LIST, ORDERED_LIST, CODE,
    BOLD_STAR, BOLD_UNDERSCORE, ITALIC_STAR, ITALIC_UNDERSCORE, STRIKETHROUGH,
} from '@lexical/markdown'
import {
    $getRoot, $createParagraphNode, $createTextNode,
    $getSelection, $isRangeSelection, FORMAT_TEXT_COMMAND,
    KEY_TAB_COMMAND, COMMAND_PRIORITY_EDITOR,
} from 'lexical'
import { $setBlocksType }                        from '@lexical/selection'
import { $createHeadingNode, $createQuoteNode }  from '@lexical/rich-text'
import { $createCodeNode }                       from '@lexical/code'
import api from '../Auth/axios'

const SAFE_TRANSFORMERS = [
    HEADING, QUOTE, UNORDERED_LIST, ORDERED_LIST, CODE,
    BOLD_STAR, BOLD_UNDERSCORE, ITALIC_STAR, ITALIC_UNDERSCORE, STRIKETHROUGH,
]

const theme = {
    heading: { h1: 'lex-h1', h2: 'lex-h2', h3: 'lex-h3' },
    list:    { ul: 'lex-ul', ol: 'lex-ol', listitem: 'lex-li', nested: { listitem: 'lex-nested-li' } },
    quote: 'lex-quote', code: 'lex-code',
    text: {
        bold: 'lex-bold', italic: 'lex-italic', underline: 'lex-underline',
        strikethrough: 'lex-strike', code: 'lex-inline-code',
    },
    paragraph: 'lex-para',
}

// ── helpers ───────────────────────────────────────────────────────────────────
function applyContentToEditor(editor, content) {
    if (!content) return
    const trimmed = content.trim()
    if (trimmed.startsWith('{')) {
        try {
            editor.setEditorState(editor.parseEditorState(trimmed))
            return
        } catch (e) {
            console.warn('State parse failed, falling back to plain text', e)
        }
    }
    editor.update(() => {
        const root = $getRoot()
        root.clear()
        trimmed.split('\n').forEach(line => {
            const p = $createParagraphNode()
            p.append($createTextNode(line))
            root.append(p)
        })
    })
}

// ── LoadPlugin ────────────────────────────────────────────────────────────────
// FIX: loadedRef is created in the PARENT and passed as a prop.
// Previously doneRef was declared inside LoadPlugin itself — every time the
// parent called setState (e.g. setBlocks after a WS message), BlockEditor
// re-rendered, LoadPlugin re-mounted, and doneRef reset to false. This caused
// the initial DB content to re-fire and overwrite whatever the remote user typed.
function LoadPlugin({ blocks, loadedRef }) {
    const [editor] = useLexicalComposerContext()

    useEffect(() => {
        if (loadedRef.current) return
        if (!blocks || blocks.length === 0) return
        const saved = blocks[0]?.content?.trim()
        if (!saved) return

        loadedRef.current = true
        setTimeout(() => applyContentToEditor(editor, saved), 80)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [blocks.length, editor])

    return null
}

// ── LiveUpdatePlugin ──────────────────────────────────────────────────────────
// FIX 1 (critical): Old code stored ONE value in liveRef.current. When the host
//   receives multiple BLOCK_UPDATE messages within the 100ms poll window (which
//   happens with every fast keystroke), all intermediate updates were overwritten
//   and silently dropped. On the host side, the editor appeared to freeze or show
//   only occasional characters, matching exactly what the video shows.
//
//   Fix: liveRef.current is now an ARRAY used as a queue. The parent pushes to it
//   with liveRef.current.push(content). The plugin drains the queue every 80ms
//   and applies the LAST item (last-write-wins, since each update is the full
//   Lexical document state, not a delta).
//
// FIX 2: Removed the lastAppliedRef dedup comparison. It compared Lexical JSON
//   strings which include internal counters/versions, so equal content always
//   looked different — the dedup was a no-op and added confusion.
function LiveUpdatePlugin({ liveRef }) {
    const [editor] = useLexicalComposerContext()

    useEffect(() => {
        const interval = setInterval(() => {
            const queue = liveRef.current
            if (!Array.isArray(queue) || queue.length === 0) return

            // Drain the queue; apply only the latest (full state, not delta)
            liveRef.current = []
            const content = queue[queue.length - 1]
            if (content) applyContentToEditor(editor, content)
        }, 80)
        return () => clearInterval(interval)
    }, [editor, liveRef])

    return null
}

// ── SuggestionPlugin ──────────────────────────────────────────────────────────
// FIX 1: Never call async code inside editorState.read(). The read lock is
//   synchronous — any awaited Promise inside it runs after the lock is released
//   and Lexical can have moved on, causing subtle corruption / silent failures.
//   The API call was previously inside read(), so the network request was fired
//   but its response was thrown away. This is why word suggestions never appeared.
//
// FIX 2: Stale-response guard via requestIdRef so a slow previous response
//   doesn't overwrite the suggestion for the current text.
function SuggestionPlugin() {
    const [editor] = useLexicalComposerContext()
    const [suggestion, setSuggestion] = useState('')
    const [predictionState, setPredictionState] = useState('idle')
    const debounceRef = useRef(null)
    const retryRef = useRef(null)
    const requestIdRef = useRef(0)
    const suggRef = useRef('')
    const lastPhraseRef = useRef('')

    useEffect(() => { suggRef.current = suggestion }, [suggestion])

    useEffect(() => {
        return () => {
            clearTimeout(debounceRef.current)
            clearTimeout(retryRef.current)
        }
    }, [])

    const fetchSuggestion = useCallback(async (phrase, requestId) => {
        try {
            const res = await api.get('/predict', { params: { text: phrase } })
            if (requestId !== requestIdRef.current || phrase !== lastPhraseRef.current) return

            const nextWord =
                res.data?.word?.trim() ||
                res.data?.prediction?.trim() ||
                res.data?.next_word?.trim() ||
                ''
            const status = res.data?.status || 'ready'

            setSuggestion(nextWord)
            setPredictionState(status)

            if (!nextWord && (status === 'loading' || status === 'idle')) {
                retryRef.current = setTimeout(() => {
                    if (requestId === requestIdRef.current && phrase === lastPhraseRef.current) {
                        fetchSuggestion(phrase, requestId)
                    }
                }, 1200)
            }
        } catch {
            if (requestId === requestIdRef.current) {
                setSuggestion('')
                setPredictionState('error')
            }
        }
    }, [])

    useEffect(() => {
        return editor.registerUpdateListener(({ editorState }) => {
            // Extract text SYNCHRONOUSLY inside read() — no async here.
            // We only want actual words, not punctuation-heavy fragments or JSON-ish noise.
            let lastPhrase = ''
            editorState.read(() => {
                const text = $getRoot().getTextContent().toLowerCase()
                const words = text.match(/[a-z][a-z']*/g) || []
                lastPhrase = words.slice(-12).join(' ')
            })
            // read() is now done. Safe to be async below.

            if (lastPhrase.length < 6) {
                lastPhraseRef.current = ''
                requestIdRef.current += 1
                clearTimeout(debounceRef.current)
                clearTimeout(retryRef.current)
                setSuggestion('')
                setPredictionState('idle')
                return
            }

            clearTimeout(debounceRef.current)
            clearTimeout(retryRef.current)
            lastPhraseRef.current = lastPhrase
            const currentId = ++requestIdRef.current

            setPredictionState('loading')
            debounceRef.current = setTimeout(() => {
                fetchSuggestion(lastPhrase, currentId)
            }, 180)
        })
    }, [editor, fetchSuggestion])

    useEffect(() => {
        return editor.registerCommand(
            KEY_TAB_COMMAND,
            (event) => {
                if (!suggRef.current) return false
                event.preventDefault()
                const word = suggRef.current
                editor.update(() => {
                    const sel = $getSelection()
                    if ($isRangeSelection(sel)) sel.insertText(word + ' ')
                })
                setSuggestion('')
                return true
            },
            COMMAND_PRIORITY_EDITOR
        )
    }, [editor])

    if (!suggestion && predictionState !== 'loading') return null
    return (
        <div className="suggestion-overlay" style={{
            position: 'absolute', top: '12px', right: '12px',
            color: '#4338ca', fontSize: '12px', fontStyle: 'normal',
            pointerEvents: 'none', userSelect: 'none',
            background: 'rgba(255,255,255,0.96)', padding: '8px 12px',
            borderRadius: '999px', border: '1px solid rgba(108,71,255,0.25)', zIndex: 30,
            boxShadow: '0 10px 24px rgba(108,71,255,0.16)',
            maxWidth: 'calc(100% - 24px)',
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>
            {suggestion ? (
                <>
                    Prediction: <b style={{ color: 'var(--purple)' }}>{suggestion}</b>{' '}
                    <span style={{ color: 'var(--text-muted)' }}>Tab to insert</span>
                </>
            ) : (
                <span style={{ color: 'var(--text-muted)' }}>Fetching prediction…</span>
            )}
        </div>
    )
}

// ── Toolbar ───────────────────────────────────────────────────────────────────
function Toolbar({ readOnly }) {
    const [editor] = useLexicalComposerContext()
    const fmt   = t  => editor.dispatchCommand(FORMAT_TEXT_COMMAND, t)
    const block = fn => editor.update(() => {
        const sel = $getSelection()
        if ($isRangeSelection(sel)) $setBlocksType(sel, fn)
    })
    if (readOnly) return null
    return (
        <div className="lex-toolbar">
            <button onMouseDown={e => { e.preventDefault(); fmt('bold') }}><b>B</b></button>
            <button onMouseDown={e => { e.preventDefault(); fmt('italic') }}><i>I</i></button>
            <button onMouseDown={e => { e.preventDefault(); fmt('underline') }}><u>U</u></button>
            <button onMouseDown={e => { e.preventDefault(); fmt('strikethrough') }}>S̶</button>
            <span className="lex-divider" />
            <button onMouseDown={e => { e.preventDefault(); block(() => $createHeadingNode('h1')) }}>H1</button>
            <button onMouseDown={e => { e.preventDefault(); block(() => $createHeadingNode('h2')) }}>H2</button>
            <button onMouseDown={e => { e.preventDefault(); block(() => $createHeadingNode('h3')) }}>H3</button>
            <button onMouseDown={e => { e.preventDefault(); block(() => $createQuoteNode()) }}>❝</button>
            <button onMouseDown={e => { e.preventDefault(); block(() => $createCodeNode()) }}>&lt;/&gt;</button>
            <button onMouseDown={e => { e.preventDefault(); block(() => $createParagraphNode()) }}>¶</button>
        </div>
    )
}

// ── Main ──────────────────────────────────────────────────────────────────────
// IMPORTANT CHANGE — liveRef is now an ARRAY queue, not a single value.
// Parent must initialise it as: const liveRef = useRef([])
// Parent writes: liveRef.current.push(msg.content)   ← NOT liveRef.current = msg.content
//
// loadedRef: created in parent (useRef(false)), passed here so LoadPlugin never
//            re-fires after the first load regardless of how many re-renders happen.
export default function BlockEditor({ blocks, wsRef, liveRef, loadedRef, onBlocksChange, readOnly = false }) {
    const debounceRef  = useRef(null)
    const prevStateRef = useRef(null)
    const blocksRef    = useRef(blocks)

    useEffect(() => { blocksRef.current = blocks }, [blocks])

    const initialConfig = useMemo(() => ({
        namespace: 'PikoDocs',
        theme,
        editable:  !readOnly,
        nodes:     [HeadingNode, QuoteNode, ListNode, ListItemNode, CodeNode, LinkNode, AutoLinkNode],
        onError:   err => console.error('Lexical:', err),
    }), [readOnly])

    // FIX: Old handleChange split plain text into groups of 5 lines and built
    // synthetic block objects. This broke sync because:
    //   • If the doc had 1 real server block but >5 lines of text, the loop
    //     created a second block with id=null → the send() was skipped silently.
    //   • Even when id was correct, block[0]'s content was only the first 5 lines
    //     of plain text, not the full Lexical JSON. The receiving client tried to
    //     parse it as JSON, failed, and fell back to plain text — losing formatting.
    //
    // Fix: map 1-to-1 over real server blocks. Block[0] always carries the complete
    // Lexical JSON. Other blocks keep their existing content unchanged.
    const handleChange = useCallback((editorState) => {
        clearTimeout(debounceRef.current)
        debounceRef.current = setTimeout(() => {
            const stateJSON = JSON.stringify(editorState.toJSON())
            if (stateJSON === prevStateRef.current) return
            prevStateRef.current = stateJSON

            const currentBlocks = blocksRef.current
            if (!currentBlocks || currentBlocks.length === 0) return

            const newBlocks = currentBlocks.map((b, idx) => ({
                ...b,
                content: idx === 0 ? stateJSON : b.content,
            }))

            newBlocks.forEach((nb, i) => {
                const old = currentBlocks[i]
                if (nb.id && wsRef?.current?.readyState === WebSocket.OPEN) {
                    if (!old || nb.content !== old.content) {
                        wsRef.current.send(JSON.stringify({
                            type:     'BLOCK_UPDATE',
                            block_id: nb.id,
                            content:  nb.content,
                        }))
                    }
                }
            })

            onBlocksChange(newBlocks)
        }, 250)
    }, [wsRef, onBlocksChange])

    return (
        <LexicalComposer initialConfig={initialConfig}>
            <div className="lex-container">
                <Toolbar readOnly={readOnly} />
                <div className="lex-editor-wrapper" style={{ position: 'relative' }}>
                    <RichTextPlugin
                        contentEditable={<ContentEditable className="lex-content" />}
                        placeholder={
                            !readOnly
                                ? <div className="lex-placeholder">Start writing… (use # for H1, ## for H2, - for list)</div>
                                : null
                        }
                        ErrorBoundary={({ children }) => <>{children}</>}
                    />
                    <HistoryPlugin />
                    <ListPlugin />
                    <MarkdownShortcutPlugin transformers={SAFE_TRANSFORMERS} />
                    <LoadPlugin blocks={blocks} loadedRef={loadedRef} />
                    {liveRef && <LiveUpdatePlugin liveRef={liveRef} />}
                    {!readOnly && <SuggestionPlugin />}
                    <OnChangePlugin onChange={handleChange} ignoreSelectionChange />
                </div>
            </div>
        </LexicalComposer>
    )
}
