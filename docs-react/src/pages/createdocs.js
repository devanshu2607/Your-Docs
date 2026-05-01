import api from '../Auth/axios'
import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import BlockEditor from './BlockEditor'
import { getDocWsUrl } from '../config'
import './User.css'

export default function CreateDocs() {
    const [error, setError]         = useState("")
    const [connected, setConnected] = useState(false)
    const [docId, setDocId]         = useState(null)
    const [showCode, setShowCode]   = useState(false)
    const [blocks, setBlocks]       = useState([])
    const [title, setTitle]         = useState("")

    const wsRef     = useRef(null)
    const liveRef   = useRef(null)
    const blocksRef = useRef([])
    const reconnectRef    = useRef(null)
    const manualCloseRef  = useRef(false)
    // BUG FIX: loadedRef must live in the parent so it doesn't reset when
    // BlockEditor re-renders. Passed into BlockEditor as a prop.
    const loadedRef = useRef(false)
    const navigate  = useNavigate()

    useEffect(() => { blocksRef.current = blocks }, [blocks])
    useEffect(() => () => {
        manualCloseRef.current = true
        clearTimeout(reconnectRef.current)
        wsRef.current?.close()
    }, [])

    const handleCreateDocs = async () => {
        if (docId) return
        if (!title.trim()) return alert("Please enter a title")
        try {
            const res    = await api.post('/create_docs', { title, content: '' })
            const newId  = res.data.id
            setDocId(newId)
            const docRes = await api.post(`/get_doc/${newId}`)
            setBlocks(docRes.data.blocks || [])
        } catch { setError("Doc could not be created") }
    }

    const handleConnect = useCallback(() => {
        if (!docId) return alert("Please create a doc first")
        manualCloseRef.current = false
        clearTimeout(reconnectRef.current)

        const cleanId = docId.trim()
        const token  = localStorage.getItem("token")
        const socket = new WebSocket(getDocWsUrl(cleanId, token))

        socket.onopen = () => { setConnected(true); setShowCode(true) }

        socket.onmessage = (event) => {
            try {
                const msg = JSON.parse(event.data)

                if (msg.type === 'INIT_BLOCKS') {
                    const nextBlocks = msg.blocks || []
                    setBlocks(nextBlocks)
                    // BUG FIX: Only push to liveRef if we haven't loaded yet.
                    // After initial load, live updates come via BLOCK_UPDATE.
                    if (!loadedRef.current && nextBlocks[0]?.content) {
                        liveRef.current = nextBlocks[0].content
                    }
                    return
                }

                if (msg.type === 'BLOCK_UPDATE' && msg.block_id) {
                    // Update React state so save button captures latest content
                    setBlocks(prev => prev.map(b =>
                        b.id === msg.block_id ? { ...b, content: msg.content } : b
                    ))
                    // Push to liveRef so LiveUpdatePlugin can update Lexical's tree
                    if (msg.block_id === blocksRef.current[0]?.id) {
                        liveRef.current = msg.content
                    }
                }
            } catch (_) {}
        }

        socket.onerror = e => console.error("WS error", e)
        socket.onclose = (ev) => {
            setConnected(false)
            console.warn("WS closed", ev?.code, ev?.reason)
            if (ev?.code === 4401) {
                setError("WebSocket auth failed. Please log in again.")
                return
            }
            if (manualCloseRef.current) return
            reconnectRef.current = setTimeout(() => {
                if (!manualCloseRef.current) handleConnect()
            }, 1500)
        }
        wsRef.current = socket
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [docId])

    const handleEndSession = () => {
        manualCloseRef.current = true
        clearTimeout(reconnectRef.current)
        if (wsRef.current?.readyState === WebSocket.OPEN)
            wsRef.current.send(JSON.stringify({ type: "END_SESSION" }))
        setConnected(false)
        setShowCode(false)
    }

    const handleSave = async () => {
        if (!docId) return
        try {
            const content = blocksRef.current[0]?.content ?? ""
            await api.put(`/update_docs/${docId}`, { title, content })
            navigate('/dashboard')
        } catch { setError("Save failed") }
    }

    const handleBlocksChange = useCallback((updated) => setBlocks(updated), [])

    return (
        <section>
            <div className="docs">
                <h1>Create Docs</h1>

                <div className="inputBox">
                    <input type="text" placeholder="Enter title" value={title}
                        onChange={e => setTitle(e.target.value)} />
                </div>

                {!docId && (
                    <div className="btn" onClick={handleCreateDocs}>Create Doc</div>
                )}

                {showCode && docId && (
                    <div>
                        <p style={{ color: "#1f2937" }}>Share Code:</p>
                        <b style={{ color: "#1f2937" }}>{docId}</b>
                    </div>
                )}

                {docId && !connected && (
                    <div className="btn" onClick={handleConnect}>▶ Start Live Editing</div>
                )}

                {connected && (
                    <div style={{ display: "flex", gap: "10px" }}>
                        <div className="btn" style={{ flex: 1, background: "linear-gradient(135deg,#a8edea,#fed6e3)" }}>
                            Connected ✅
                        </div>
                        <div className="btn" style={{ flex: 1, background: "linear-gradient(135deg,#ff6b6b,#ee0979)" }}
                            onClick={handleEndSession}>🔴 End Session
                        </div>
                    </div>
                )}

                {docId && (
                    <BlockEditor
                        blocks={blocks}
                        wsRef={wsRef}
                        liveRef={liveRef}
                        loadedRef={loadedRef}
                        onBlocksChange={handleBlocksChange}
                    />
                )}

                {docId && (
                    <div className="btn" onClick={handleSave}>💾 Save Doc</div>
                )}

                {error && <p style={{ color: "red" }}>{error}</p>}
            </div>
        </section>
    )
}
