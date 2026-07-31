import api from '../Auth/axios'
import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import BlockEditor from './BlockEditor'
import { getDocWsUrl } from '../config'
import './User.css'

export default function CreateDocs() {
    const MAX_RECONNECT_ATTEMPTS = 6
    const [error, setError]         = useState("")
    const [connected, setConnected] = useState(false)
    const [docId, setDocId]         = useState(null)
    const [showCode, setShowCode]   = useState(false)
    const [blocks, setBlocks]       = useState([])
    const [title, setTitle]         = useState("")
    const [joinCode, setJoinCode]   = useState("")
    const [shareCode, setShareCode] = useState("")

    const wsRef          = useRef(null)
    const liveRef        = useRef([])       // ← ARRAY queue, not single value
    const contentRef     = useRef("")
    const blocksRef      = useRef([])
    const reconnectRef   = useRef(null)
    const reconnectAttemptsRef = useRef(0)
    const manualCloseRef = useRef(false)
    const loadedRef      = useRef(false)    // ← in parent so survives re-renders
    const connectingRef  = useRef(false)    // ← guard against double-click connect
    const navigate       = useNavigate()

    const handleLogout = async () => {
        try { await api.post('/logout') } catch { /* ignore */ }
        finally {
            localStorage.removeItem("token")
            navigate("/login")
        }
    }
// ... [rest unchanged up to return]
    useEffect(() => { blocksRef.current = blocks }, [blocks])
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

    const handleCreateDocs = async () => {
        if (docId) return
        if (!title.trim()) return alert("Please enter a title")
        try {
            const res    = await api.post('/create_docs', { title, content: '' })
            const newId  = res.data.id
            setDocId(newId)
            setShareCode(res.data.join_code || "")
            const docRes = await api.post(`/get_doc/${newId}`)
            setBlocks(docRes.data.blocks || [])
            setShareCode(docRes.data.join_code || res.data.join_code || "")
        } catch { setError("Doc could not be created") }
    }

    const handleConnect = useCallback(() => {
        if (!docId) return alert("Please create a doc first")
        if (connectingRef.current) return
        connectingRef.current = true
        manualCloseRef.current = false
        clearTimeout(reconnectRef.current)
        closeSocket()

        const cleanId = docId.trim()
        const token   = localStorage.getItem("token")
        if (!token) {
            setError("Please log in again before starting a live session.")
            return
        }
        const socket  = new WebSocket(getDocWsUrl(cleanId, token))

        socket.onopen = () => {
            reconnectAttemptsRef.current = 0
            connectingRef.current = false
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

                if (msg.type === 'INIT' || msg.type === 'INIT_BLOCKS') {
                    const nextBlocks = msg.blocks || []
                    setBlocks(nextBlocks)
                    if (msg.content) {
                        contentRef.current = msg.content
                    }
                    // Only load into editor on first connect — never overwrite user edits
                    if (!loadedRef.current && nextBlocks[0]?.content) {
                        liveRef.current.push(nextBlocks[0].content)  // ← push to queue
                    }
                    return
                }

                if (msg.type === 'BLOCK_UPDATE' && msg.block_id) {
                    setBlocks(prev => prev.map(b =>
                        b.id === msg.block_id ? { ...b, content: msg.content } : b
                    ))
                    // Push to queue so LiveUpdatePlugin never drops a fast update
                    if (msg.block_id === blocksRef.current[0]?.id) {
                        liveRef.current.push(msg.content)            // ← push to queue
                    }
                }
            } catch (_) {}
        }

        socket.onerror = e => {
            console.error("WS error", e)
            connectingRef.current = false
        }
        socket.onclose = (ev) => {
            setConnected(false)
            console.warn("WS closed", ev?.code, ev?.reason)
            if (ev?.code === 4401) {
                setError("WebSocket auth failed. Please log in again.")
                return
            }
            if (ev?.reason === "Session ended by host") {
                setError("Live session ended.")
                return
            }
            if (manualCloseRef.current) return
            reconnectAttemptsRef.current += 1
            if (reconnectAttemptsRef.current > MAX_RECONNECT_ATTEMPTS) {
                setError("Live session disconnected. Please reconnect manually.")
                return
            }
            reconnectRef.current = setTimeout(() => {
                if (!manualCloseRef.current) handleConnect()
            }, Math.min(1500 * reconnectAttemptsRef.current, 6000))
        }
        wsRef.current = socket
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [closeSocket, docId])

    const handleEndSession = () => {
        manualCloseRef.current = true
        clearTimeout(reconnectRef.current)
        if (wsRef.current?.readyState === WebSocket.OPEN)
            wsRef.current.send(JSON.stringify({ type: "END_SESSION" }))
        setConnected(false)
        setShowCode(false)
        closeSocket()
    }

    const handleSave = async () => {
        if (!docId) return
        try {
            const content = contentRef.current || blocksRef.current[0]?.content || ""
            await api.put(`/update_docs/${docId}`, { title, content })
            navigate('/dashboard')
        } catch { setError("Save failed") }
    }

    const handleBlocksChange = useCallback((updated) => setBlocks(updated), [])

    return (
        <div className="page docs-page">
            <div className="navbar">
                <h2 onClick={() => navigate("/dashboard")} style={{ cursor: 'pointer' }}>CLAY</h2>
                <div className="nav-actions">
                    <span className="nav-link" onClick={() => navigate("/create_docs")}>
                        Create
                    </span>

                    <div className="nav-join-group">
                        <input
                            placeholder="Enter Code"
                            value={joinCode}
                            onChange={e => setJoinCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6))}
                        />
                        <span className="nav-link" onClick={() => {
                            if (!joinCode) return alert("Enter code")
                            navigate(`/join/${joinCode}`)
                        }}>
                            Join
                        </span>
                    </div>

                    <span className="nav-link logout" onClick={handleLogout}>
                        Logout
                    </span>
                </div>
            </div>

            <div className="docs">
                <h1>Create Docs</h1>

                <div className="inputBox">
                    <input type="text" placeholder="Enter title" value={title}
                        onChange={e => setTitle(e.target.value)} />
                </div>

                {!docId && (
                    <div className="btn" onClick={handleCreateDocs}>Create Doc</div>
                )}

                {showCode && (shareCode || docId) && (
                    <div style={{ margin: "10px 0" }}>
                        <p style={{ color: "#a0a5b0", marginBottom: "4px" }}>Share Code:</p>
                        <b style={{ color: "#ffffff", fontSize: "16px", fontFamily: "monospace", letterSpacing: "0.12em" }}>{shareCode || docId}</b>
                    </div>
                )}

                {docId && !connected && (
                    <div className="btn" onClick={handleConnect}>▶ Start Live Editing</div>
                )}

                {connected && (
                    <div style={{ display: "flex", gap: "10px", margin: "10px 0" }}>
                        <div className="btn" style={{ flex: 1, background: "linear-gradient(135deg,#059669,#10b981)", color: "#ffffff" }}>
                            Connected ✅
                        </div>
                        <div className="btn" style={{ flex: 1, background: "linear-gradient(135deg,#ff6b6b,#ee0979)", color: "#ffffff" }}
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
                        contentRef={contentRef}
                        onBlocksChange={handleBlocksChange}
                    />
                )}

                {docId && (
                    <div className="btn" onClick={handleSave} style={{ marginTop: "16px" }}>💾 Save Doc</div>
                )}

                {error && <p style={{ color: "#e11d48", marginTop: "10px" }}>{error}</p>}
            </div>
        </div>
    )
}
