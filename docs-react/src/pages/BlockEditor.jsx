// BlockEditor.jsx — Complete rewrite, all 3 bugs properly fixed
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

// ── LoadPlugin ────────────────────────────────────────────────────────────────
// Runs once when blocks first arrive. Uses a flag so it never overwrites user input.
function LoadPlugin({ blocks }) {
    const [editor] = useLexicalComposerContext()
    const doneRef  = useRef(false)

    useEffect(() => {
        if (doneRef.current) return              // already loaded — never run again
        if (!blocks || blocks.length === 0) return
        const saved = blocks[0]?.content?.trim()
        if (!saved) return                        // empty block — nothing to load

        doneRef.current = true                   // mark done BEFORE async work

        setTimeout(() => {
            if (saved.startsWith('{')) {
                try {
                    editor.setEditorState(editor.parseEditorState(saved))
                    return
                } catch (e) { console.warn('State parse failed, plain text fallback', e) }
            }
            // plain text fallback
            editor.update(() => {
                const root = $getRoot()
                root.clear()
                blocks.map(b => b.content || '').join('\n')
                    .split('\n')
                    .forEach(line => {
                        const p = $createParagraphNode()
                        p.append($createTextNode(line))
                        root.append(p)
                    })
            })
        }, 80)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [blocks.length, editor])  // only re-check when blocks array length changes
    //                              (empty→filled transition), never when content changes

    return null
}

// ── LiveUpdatePlugin ───────────────────────────────────────────────────────────
// Polls a shared ref every 100ms. WS onmessage writes to this ref.
// This is the ONLY correct way to push external content into Lexical —
// React setState alone does NOT update Lexical's internal state tree.
function LiveUpdatePlugin({ liveRef }) {
    const [editor] = useLexicalComposerContext()

    useEffect(() => {
        const interval = setInterval(() => {
            const content = liveRef.current
            if (!content) return
            liveRef.current = null          // consume

            const trimmed = content.trim()
            if (trimmed.startsWith('{')) {
                try {
                    editor.setEditorState(editor.parseEditorState(trimmed))
                    return
                } catch (e) { console.warn('Live parse failed', e) }
            }
            editor.update(() => {
                const root = $getRoot()
                root.clear()
                trimmed.split('\n').filter(Boolean).forEach(line => {
                    const p = $createParagraphNode()
                    p.append($createTextNode(line))
                    root.append(p)
                })
            })
        }, 100)
        return () => clearInterval(interval)
    }, [editor, liveRef])

    return null
}

// ── SuggestionPlugin ──────────────────────────────────────────────────────────
function SuggestionPlugin() {
    const [editor]     = useLexicalComposerContext()
    const [suggestion, setSuggestion] = useState('')
    const debounceRef  = useRef(null)
    const suggRef      = useRef('')

    useEffect(() => { suggRef.current = suggestion }, [suggestion])

    useEffect(() => {
        return editor.registerUpdateListener(({ editorState }) => {
            editorState.read(() => {
                const words = $getRoot().getTextContent().trim().split(/\s+/).filter(Boolean)
                const last3 = words.slice(-3).join(' ')
                if (last3.length < 3) { setSuggestion(''); return }
                clearTimeout(debounceRef.current)
                debounceRef.current = setTimeout(async () => {
                    try {
                        const res = await api.get('/predict', { params: { text: last3 } })
                        const nextWord =
                            res.data?.word?.trim() ||
                            res.data?.prediction?.trim() ||
                            res.data?.next_word?.trim() ||
                            ''
                        setSuggestion(nextWord)
                    } catch { setSuggestion('') }
                }, 300)
            })
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
            position: 'absolute', bottom: '12px', right: '16px',
            color: '#9ca3af', fontSize: '12px', fontStyle: 'italic',
            pointerEvents: 'none', userSelect: 'none',
            background: 'rgba(245,240,232,0.95)', padding: '3px 10px',
            borderRadius: '4px', border: '1px solid var(--paper-deep)', zIndex: 10,
        }}>
            Tab → <b style={{ color: 'var(--ink)' }}>{suggestion}</b>
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
// liveRef: a React ref created in the PARENT and passed here.
//          Parent's WS onmessage writes to it: liveRef.current = msg.content
//          LiveUpdatePlugin reads + clears it every 100ms.
export default function BlockEditor({ blocks, wsRef, liveRef, onBlocksChange, readOnly = false }) {
    const debounceRef  = useRef(null)
    const prevStateRef = useRef(null)
    const blocksRef    = useRef(blocks)  // always latest blocks without causing re-renders

    useEffect(() => { blocksRef.current = blocks }, [blocks])

    const initialConfig = {
        namespace: 'PikoDocs',
        theme,
        editable:  !readOnly,
        nodes:     [HeadingNode, QuoteNode, ListNode, ListItemNode, CodeNode, LinkNode, AutoLinkNode],
        onError:   err => console.error('Lexical:', err),
    }

    const handleChange = useCallback((editorState) => {
        clearTimeout(debounceRef.current)
        debounceRef.current = setTimeout(() => {
            const stateJSON = JSON.stringify(editorState.toJSON())
            if (stateJSON === prevStateRef.current) return
            prevStateRef.current = stateJSON

            let plainLines = []
            editorState.read(() => {
                plainLines = $getRoot().getTextContent().split('\n')
            })

            const LINES = 5
            const currentBlocks = blocksRef.current
            const newBlocks = []

            for (let i = 0; i < Math.max(plainLines.length, 1); i += LINES) {
                const idx = Math.floor(i / LINES)
                newBlocks.push({
                    id:      currentBlocks[idx]?.id ?? null,
                    index:   idx,
                    content: idx === 0 ? stateJSON : plainLines.slice(i, i + LINES).join('\n'),
                })
            }

            // Send only changed blocks via WS
            newBlocks.forEach((nb, i) => {
                const old = currentBlocks[i]
                if (nb.id && wsRef?.current?.readyState === WebSocket.OPEN) {
                    if (!old || nb.content !== old.content) {
                        wsRef.current.send(JSON.stringify({
                            type: 'BLOCK_UPDATE', block_id: nb.id, content: nb.content,
                        }))
                    }
                }
            })

            onBlocksChange(newBlocks)
        }, 250)
    }, [wsRef, onBlocksChange])   // NO blocks in dep array — use blocksRef instead

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
                    <LoadPlugin blocks={blocks} />
                    {liveRef && <LiveUpdatePlugin liveRef={liveRef} />}
                    {!readOnly && <SuggestionPlugin />}
                    <OnChangePlugin onChange={handleChange} ignoreSelectionChange />
                </div>
            </div>
        </LexicalComposer>
    )
}
