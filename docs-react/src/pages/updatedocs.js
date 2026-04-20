import api from '../Auth/axios'
import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import BlockEditor from './BlockEditor'
import { getDocWsUrl } from '../config'
import './User.css'

export default function UpdateDocs() {
    const { id }   = useParams()
    const navigate = useNavigate()

    const [title, setTitle]         = useState("")
    const [blocks, setBlocks]       = useState([])
    const [role, setRole]           = useState("")
    const [connected, setConnected] = useState(false)
    const [showCode, setShowCode]   = useState(false)
    const [error, setError]         = useState("")
    const [saved, setSaved]         = useState(false)
    const [loading, setLoading]     = useState(false)

    const wsRef     = useRef(null)
    const liveRef   = useRef(null)   // WS writes here → LiveUpdatePlugin reads it
    const blocksRef = useRef([])

    useEffect(() => { blocksRef.current = blocks }, [blocks])

    useEffect(() => {
        if (!id) return
        api.post(`/get_doc/${id}`)
            .then(res => {
                setTitle(res.data.title || "")
                setBlocks(res.data.blocks || [])
                setRole(res.data.role || "editor")
            })
            .catch(() => setError("Doc load failed"))
    }, [id])

    useEffect(() => () => { wsRef.current?.close() }, [])

    const handleStartSession = () => {
        const token  = localStorage.getItem("token")
        const cleanId = id.trim()
        const socket = new WebSocket(getDocWsUrl(cleanId, token))

        socket.onopen = () => { setConnected(true); setShowCode(true) }

        socket.onmessage = (event) => {
            try {
                const msg = JSON.parse(event.data)
                if (msg.type === 'INIT_BLOCKS') {
                    const nextBlocks = msg.blocks || []
                    setBlocks(nextBlocks)
                    if (nextBlocks[0]?.content) {
                        liveRef.current = nextBlocks[0].content
                    }
                    return
                }

                if (msg.type === 'BLOCK_UPDATE' && msg.block_id) {
                    // 1. Update React state (for save button)
                    setBlocks(prev => prev.map(b =>
                        b.id === msg.block_id ? { ...b, content: msg.content } : b
                    ))
                    // 2. If block[0] changed, write to liveRef so LiveUpdatePlugin
                    //    can push it directly into Lexical's internal state tree
                    if (msg.block_id === blocksRef.current[0]?.id) {
                        liveRef.current = msg.content
                    }
                }
            } catch (_) {}
        }

        socket.onerror  = e => console.error("WS error", e)
        socket.onclose  = () => { setConnected(false); setShowCode(false) }
        wsRef.current   = socket
    }

    const handleEndSession = () => {
        if (wsRef.current?.readyState === WebSocket.OPEN)
            wsRef.current.send(JSON.stringify({ type: "END_SESSION" }))
        setConnected(false)
        setShowCode(false)
    }

    const handleUpdate = async () => {
        if (loading) return
        setLoading(true)
        try {
            const content = blocksRef.current[0]?.content ?? ""
            await api.put(`/update_docs/${id}`, { title, content })
            setSaved(true)
            setTimeout(() => navigate("/dashboard"), 1000)
        } catch { setError("Update failed") }
        finally { setLoading(false) }
    }

    const handleBlocksChange = useCallback((updated) => setBlocks(updated), [])

    return (
        <section>
            <div className="docs">
                <h1>Edit Doc</h1>

                <div className="inputBox">
                    <input type="text" placeholder="Title" value={title}
                        onChange={e => setTitle(e.target.value)} />
                </div>

                {showCode && (
                    <div>
                        <p style={{ color: "#1f2937" }}>Share Code:</p>
                        <b style={{ color: "#1f2937" }}>{id}</b>
                    </div>
                )}

                {!connected ? (
                    <div className="btn" onClick={handleStartSession}>🔴 Start Live Session</div>
                ) : (
                    <div style={{ display: "flex", gap: "10px" }}>
                        <div className="btn" style={{ flex: 1, background: "linear-gradient(135deg,#a8edea,#fed6e3)" }}>
                            Connected ✅
                        </div>
                        <div className="btn" style={{ flex: 1, background: "linear-gradient(135deg,#ff6b6b,#ee0979)" }}
                            onClick={handleEndSession}>🔴 End Session
                        </div>
                    </div>
                )}

                <BlockEditor
                    blocks={blocks}
                    wsRef={wsRef}
                    liveRef={liveRef}
                    onBlocksChange={handleBlocksChange}
                />

                <div className="btn" onClick={handleUpdate} style={{ opacity: loading ? 0.6 : 1 }}>
                    {loading ? "Saving…" : "💾 Save Changes"}
                </div>

                {saved && <p style={{ color: "green" }}>Saved! Redirecting…</p>}
                {error && <p style={{ color: "red" }}>{error}</p>}

                {role === "owner" && (
                    <div className="btn"
                        style={{ background: "linear-gradient(135deg,#ff6b6b,#ee0979)", marginTop: "4px" }}
                        onClick={async () => {
                            if (!window.confirm("Delete this doc?")) return
                            await api.delete(`/delete_docs/${id}`)
                            navigate("/dashboard")
                        }}>
                        🗑 Delete Doc
                    </div>
                )}
            </div>
        </section>
    )
}
