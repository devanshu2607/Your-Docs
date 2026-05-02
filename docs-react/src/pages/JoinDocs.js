import api from '../Auth/axios'
import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import BlockEditor from './BlockEditor'
import { getDocWsUrl } from '../config'
import './User.css'

export default function JoinDocs() {
    const MAX_RECONNECT_ATTEMPTS = 6
    const { docId } = useParams()
    const navigate  = useNavigate()

    const [joined, setJoined] = useState(false)
    const [blocks, setBlocks] = useState([])
    const [error, setError]   = useState("")

    const wsRef          = useRef(null)
    const liveRef        = useRef([])       // ← ARRAY queue, not single value
    const blocksRef      = useRef([])
    const reconnectRef   = useRef(null)
    const reconnectAttemptsRef = useRef(0)
    const manualCloseRef = useRef(false)
    const loadedRef      = useRef(false)    // ← in parent so survives re-renders

    useEffect(() => { blocksRef.current = blocks }, [blocks])

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

    useEffect(() => {
        if (!docId) return

        const loadAndConnect = async () => {
            try {
                await api.post(`/join_docs/${docId}`)
                const res = await api.post(`/get_doc/${docId}`)
                setBlocks(res.data.blocks || [])
            } catch (e) {
                console.error("Fetch failed", e)
                setError("Failed to load document. Please try again.")
            }

            manualCloseRef.current = false
            clearTimeout(reconnectRef.current)
            closeSocket()

            const token   = localStorage.getItem("token")
            if (!token) {
                setJoined(false)
                console.error("Missing auth token for websocket connection")
                return
            }
            const cleanId = docId.trim()
            const socket  = new WebSocket(getDocWsUrl(cleanId, token))

            socket.onopen = () => {
                reconnectAttemptsRef.current = 0
                setJoined(true)
            }

            socket.onmessage = (event) => {
                try {
                    const msg = JSON.parse(event.data)

                    if (msg.type === 'ERROR') {
                        manualCloseRef.current = true
                        socket.close()
                        return
                    }

                    if (msg.type === 'INIT_BLOCKS') {
                        const nextBlocks = msg.blocks || []
                        setBlocks(nextBlocks)
                        // Only push to queue on the very first connect
                        if (!loadedRef.current && nextBlocks[0]?.content) {
                            liveRef.current.push(nextBlocks[0].content)  // ← push to queue
                        }
                        return
                    }

                    if (msg.type === 'BLOCK_UPDATE' && msg.block_id) {
                        setBlocks(prev => prev.map(b =>
                            b.id === msg.block_id ? { ...b, content: msg.content } : b
                        ))
                        // Push every update — never drop fast consecutive messages
                        if (msg.block_id === blocksRef.current[0]?.id) {
                            liveRef.current.push(msg.content)            // ← push to queue
                        }
                    }
                } catch (_) {}
            }

            socket.onerror = e => console.error("WS error", e)
            socket.onclose = (ev) => {
                setJoined(false)
                console.warn("WS closed", ev?.code, ev?.reason)
                if (ev?.code === 4401) {
                    alert("WebSocket auth failed. Please log in again.")
                    return
                }
                if (ev.reason === "Session ended by host") {
                    alert("The host has ended this session.")
                    navigate("/dashboard")
                    return
                }
                if (!manualCloseRef.current) {
                    reconnectAttemptsRef.current += 1
                    if (reconnectAttemptsRef.current > MAX_RECONNECT_ATTEMPTS) {
                        alert("Live session disconnected. Please join again.")
                        navigate("/dashboard")
                        return
                    }
                    reconnectRef.current = setTimeout(() => {
                        if (!manualCloseRef.current) loadAndConnect()
                    }, Math.min(1500 * reconnectAttemptsRef.current, 6000))
                }
            }

            wsRef.current = socket
        }

        loadAndConnect()
        return () => {
            manualCloseRef.current = true
            clearTimeout(reconnectRef.current)
            closeSocket()
        }
    }, [closeSocket, docId, navigate])

    const handleLeave = () => {
        manualCloseRef.current = true
        clearTimeout(reconnectRef.current)
        closeSocket()
        navigate("/dashboard")
    }

    const handleBlocksChange = useCallback((updated) => setBlocks(updated), [])

    return (
        <section>
            <div className="docs">
                <h1>Live Doc</h1>

                {error && <p style={{ color: "red" }}>{error}</p>}

                {!joined ? (
                    <p style={{ color: "#1f2937" }}>Connecting…</p>
                ) : (
                    <>
                        <p style={{ color: "green" }}>Connected ✅</p>

                        <BlockEditor
                            blocks={blocks}
                            wsRef={wsRef}
                            liveRef={liveRef}
                            loadedRef={loadedRef}
                            onBlocksChange={handleBlocksChange}
                        />

                        <div className="btn"
                            style={{ background: "linear-gradient(135deg,#ff6b6b,#ee0979)", marginTop: "8px" }}
                            onClick={handleLeave}>
                            🚪 Leave Session
                        </div>
                    </>
                )}
            </div>
        </section>
    )
}
