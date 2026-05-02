import api from '../Auth/axios'
import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import BlockEditor from './BlockEditor'
import { getDocWsUrl } from '../config'
import './User.css'

export default function UpdateDocs() {
    const MAX_RECONNECT_ATTEMPTS = 6
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

    const wsRef          = useRef(null)
    const liveRef        = useRef([])       // ← ARRAY queue, not single value
    const blocksRef      = useRef([])
    const reconnectRef   = useRef(null)
    const reconnectAttemptsRef = useRef(0)
    const manualCloseRef = useRef(false)
    const loadedRef      = useRef(false)    // ← in parent so survives re-renders

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

    useEffect(() => () => {
        manualCloseRef.current = true
        clearTimeout(reconnectRef.current)
        wsRef.current?.close()
    }, [])

    const closeSocket = useCallback(() => {
        if (wsRef.current) {
            wsRef.current.onopen = null
            wsRef.current.onmessage = null
            wsRef.current.onerror = null
            wsRef.current.onclose = null
            if (
                wsRef.current.readyState === WebSocket.OPEN ||
                wsRef.current.readyState === WebSocket.CONNECTING
            ) {
                wsRef.current.close()
            }
            wsRef.current = null
        }
    }, [])

    const handleStartSession = useCallback(() => {
        manualCloseRef.current = false
        clearTimeout(reconnectRef.current)
        closeSocket()
        const token   = localStorage.getItem("token")
        if (!token) {
            setError("Please log in again before starting a live session.")
            return
        }
        const cleanId = id.trim()
        const socket  = new WebSocket(getDocWsUrl(cleanId, token))

        socket.onopen = () => {
            reconnectAttemptsRef.current = 0
            setError("")
            setConnected(true)
            setShowCode(true)
        }

        socket.onmessage = (event) => {
            try {
                const msg = JSON.parse(event.data)

                if (msg.type === 'ERROR') {
                    setError(msg.detail || "Live session connection failed.")
                    manualCloseRef.current = true
                    socket.close()
                    return
                }

                if (msg.type === 'INIT_BLOCKS') {
                    const nextBlocks = msg.blocks || []
                    setBlocks(nextBlocks)
                    // Only push to queue on very first connect
                    if (!loadedRef.current && nextBlocks[0]?.content) {
                        liveRef.current.push(nextBlocks[0].content)  // ← push to queue
                    }
                    return
                }

                if (msg.type === 'BLOCK_UPDATE' && msg.block_id) {
                    setBlocks(prev => prev.map(b =>
                        b.id === msg.block_id ? { ...b, content: msg.content } : b
                    ))
                    // Push every update to queue — LiveUpdatePlugin drains it, never drops
                    if (msg.block_id === blocksRef.current[0]?.id) {
                        liveRef.current.push(msg.content)            // ← push to queue
                    }
                }
            } catch (_) {}
        }

        socket.onerror = e => console.error("WS error", e)
        socket.onclose = (ev) => {
            setConnected(false)
            setShowCode(false)
            if (manualCloseRef.current) return
            if (ev?.code === 4401) {
                setError("WebSocket auth failed. Please log in again.")
                return
            }
            if (ev?.reason === "Session ended by host") {
                setError("The live session ended.")
                return
            }
            console.warn("WS closed", ev?.code, ev?.reason)
            reconnectAttemptsRef.current += 1
            if (reconnectAttemptsRef.current > MAX_RECONNECT_ATTEMPTS) {
                setError("Live session disconnected. Please reconnect manually.")
                return
            }
            reconnectRef.current = setTimeout(() => {
                if (!manualCloseRef.current) handleStartSession()
            }, Math.min(1500 * reconnectAttemptsRef.current, 6000))
        }
        wsRef.current = socket
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [closeSocket, id])

    const handleEndSession = () => {
        manualCloseRef.current = true
        clearTimeout(reconnectRef.current)
        if (wsRef.current?.readyState === WebSocket.OPEN)
            wsRef.current.send(JSON.stringify({ type: "END_SESSION" }))
        setConnected(false)
        setShowCode(false)
        closeSocket()
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
                    loadedRef={loadedRef}
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
