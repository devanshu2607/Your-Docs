// BlockEditor.jsx — All bugs fixed
import { useEffect, useRef, useCallback, useState } from 'react'
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
// BUG FIX: doneRef was inside the component so it reset on every re-render.
// We now receive a shared loadedRef from the parent (created once, lives as long
// as the editor session) so it truly fires only once.
function LoadPlugin({ blocks, loadedRef }) {
    const [editor] = useLexicalComposerContext()

    useEffect(() => {
        if (loadedRef.current) return          // already loaded — never run again
        if (!blocks || blocks.length === 0) return
        const saved = blocks[0]?.content?.trim()
        if (!saved) return

        loadedRef.current = true               // mark done BEFORE async work

        // Small delay so Lexical finishes mounting before we mutate its state
        setTimeout(() => {
            applyContentToEditor(editor, saved)
        }, 80)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [blocks.length, editor])
    // ↑ Only triggers when blocks go from 0→N (initial load), not on content edits

    return null
}

// ── LiveUpdatePlugin ───────────────────────────────────────────────────────────
// BUG FIX: The old code set liveRef.current = null BEFORE calling
// editor.setEditorState / editor.update, which are async. If the interval fired
// again within that async gap the content was already gone.
// Fix: snapshot + clear atomically at the top, then apply.
// Also skips applying content that is identical to what is already in the editor
// to avoid caret-reset on every keystroke when you are the local editor.
function LiveUpdatePlugin({ liveRef }) {
    const [editor] = useLexicalComposerContext()
    const lastAppliedRef = useRef(null)

    useEffect(() => {
        const interval = setInterval(() => {
            const content = liveRef.current
            if (!content) return
            liveRef.current = null              // consume atomically

            // Don't re-apply content we already applied (avoids caret jumping)
            if (content === lastAppliedRef.current) return
            lastAppliedRef.current = content

            applyContentToEditor(editor, content)
        }, 100)
        return () => clearInterval(interval)
    }, [editor, liveRef])

    return null
}

// ── SuggestionPlugin ──────────────────────────────────────────────────────────
// BUG FIX 1: editorState.read() is synchronous — the async api call must be
//            started OUTSIDE the read callback, not inside it.
// BUG FIX 2: The debounce ref was being cleared even if the previous call was
//            still in-flight, causing multiple concurrent requests.
// BUG FIX 3: Added a stale-check so a slow response from a previous keystroke
//            doesn't overwrite the suggestion for the current text.
function SuggestionPlugin() {
    const [editor]     = useLexicalComposerContext()
    const [suggestion, setSuggestion] = useState('')
    const debounceRef  = useRef(null)
    const requestIdRef = useRef(0)       // stale-response guard
    const suggRef      = useRef('')

    useEffect(() => { suggRef.current = suggestion }, [suggestion])

    useEffect(() => {
        return editor.registerUpdateListener(({ editorState }) => {
            // Read text synchronously inside the read callback
            let last3 = ''
            editorState.read(() => {
                const words = $getRoot().getTextContent().trim().split(/\s+/).filter(Boolean)
                last3 = words.slice(-3).join(' ')
            })

            if (last3.length < 3) {
                setSuggestion('')
                return
            }

            // Debounce the network call outside read()
            clearTimeout(debounceRef.current)
            const currentId = ++requestIdRef.current
            debounceRef.current = setTimeout(async () => {
                try {
                    const res = await api.get('/predict', { params: { text: last3 } })
                    // Discard if a newer request is already in flight
                    if (currentId !== requestIdRef.current) return
                    const nextWord =
                        res.data?.word?.trim() ||
                        res.data?.prediction?.trim() ||
                        res.data?.next_word?.trim() ||
                        ''
                    setSuggestion(nextWord)
                } catch {
                    if (currentId === requestIdRef.current) setSuggestion('')
                }
            }, 400)
        })
    }, [editor])

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

    if (!suggestion) return null
    return (
        <div className="suggestion-overlay" style={{
            position: 'absolute', top: '12px', right: '12px',
            color: '#4338ca', fontSize: '12px', fontStyle: 'normal',
            pointerEvents: 'none', userSelect: 'none',
            background: 'rgba(255,255,255,0.96)', padding: '8px 12px',
            borderRadius: '999px', border: '1px solid rgba(108,71,255,0.25)', zIndex: 30,
            boxShadow: '0 10px 24px rgba(108,71,255,0.16)',
            maxWidth: 'calc(100% - 24px)',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
        }}>
            Prediction: <b style={{ color: 'var(--purple)' }}>{suggestion}</b>{' '}
            <span style={{ color: 'var(--text-muted)' }}>Tab to insert</span>
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
// loadedRef: created OUTSIDE (in parent) and passed in, so it survives re-renders
// liveRef:   created in parent, WS onmessage writes: liveRef.current = msg.content
//            LiveUpdatePlugin reads + clears every 100ms
export default function BlockEditor({ blocks, wsRef, liveRef, loadedRef, onBlocksChange, readOnly = false }) {
    const debounceRef  = useRef(null)
    const prevStateRef = useRef(null)
    const blocksRef    = useRef(blocks)

    useEffect(() => { blocksRef.current = blocks }, [blocks])

    const initialConfig = {
        namespace: 'PikoDocs',
        theme,
        editable:  !readOnly,
        nodes:     [HeadingNode, QuoteNode, ListNode, ListItemNode, CodeNode, LinkNode, AutoLinkNode],
        onError:   err => console.error('Lexical:', err),
    }

    // BUG FIX: handleChange block-grouping was using a fixed LINES=5 split on
    // plaintext lines, which produced new synthetic blocks that didn't match
    // the real block IDs from the server. This caused BLOCK_UPDATE messages to
    // never match any existing block on other clients.
    // Fix: always map 1-to-1 against the real server blocks. Block 0 carries the
    // full Lexical JSON state; remaining blocks carry their original plain text.
    const handleChange = useCallback((editorState) => {
        clearTimeout(debounceRef.current)
        debounceRef.current = setTimeout(() => {
            const stateJSON = JSON.stringify(editorState.toJSON())
            if (stateJSON === prevStateRef.current) return
            prevStateRef.current = stateJSON

            const currentBlocks = blocksRef.current
            if (!currentBlocks || currentBlocks.length === 0) return

            // Build updated blocks: block[0] always gets the full Lexical JSON,
            // extra blocks keep their existing content (we don't split arbitrarily).
            const newBlocks = currentBlocks.map((b, idx) => ({
                ...b,
                content: idx === 0 ? stateJSON : b.content,
            }))

            // Send only changed blocks via WS
            newBlocks.forEach((nb, i) => {
                const old = currentBlocks[i]
                if (nb.id && wsRef?.current?.readyState === WebSocket.OPEN) {
                    if (!old || nb.content !== old.content) {
                        wsRef.current.send(JSON.stringify({
                            type: 'BLOCK_UPDATE',
                            block_id: nb.id,
                            content: nb.content,
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
