import api from '../Auth/axios'
import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import BlockEditor from './BlockEditor'
import { getDocWsUrl } from '../config'
import './User.css'

export default function JoinDocs() {
    const { docId } = useParams()
    const navigate  = useNavigate()

    const [joined, setJoined] = useState(false)
    const [blocks, setBlocks] = useState([])

    const wsRef     = useRef(null)
    const liveRef   = useRef(null)   // WS writes here → LiveUpdatePlugin reads it
    const blocksRef = useRef([])

    useEffect(() => { blocksRef.current = blocks }, [blocks])

    useEffect(() => {
        if (!docId) return

        const loadAndConnect = async () => {
            try {
                const res = await api.get(`/get_doc/${docId}`)
                setBlocks(res.data.blocks || [])

                const key = `copied_${docId}`
                if (!localStorage.getItem(key)) {
                    localStorage.setItem(key, 'true')
                    await api.post(`/join_docs/${docId}`)
                }
            } catch (e) { console.error("Fetch failed", e) }

            const token  = localStorage.getItem("token")
            const cleanId = docId.trim()
            const socket = new WebSocket(getDocWsUrl(cleanId, token))

            socket.onopen = () => setJoined(true)

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
                        setBlocks(prev => prev.map(b =>
                            b.id === msg.block_id ? { ...b, content: msg.content } : b
                        ))

                        if (msg.block_id === blocksRef.current[0]?.id) {
                            liveRef.current = msg.content
                        }
                    }
                } catch (_) {}
            }

            socket.onerror  = e => console.error("WS error", e)
            socket.onclose  = (ev) => {
                setJoined(false)
                if (ev.reason === "Session ended by host") {
                    alert("The host has ended this session.")
                    navigate("/dashboard")
                }
            }

            wsRef.current = socket
        }

        loadAndConnect()
        return () => wsRef.current?.close()
    }, [docId, navigate])

    const handleLeave = () => {
        wsRef.current?.close()
        navigate("/dashboard")
    }

    const handleBlocksChange = useCallback((updated) => setBlocks(updated), [])

    return (
        <section>
            <div className="docs">
                <h1>Live Doc</h1>

                {!joined ? (
                    <p style={{ color: "#1f2937" }}>Connecting…</p>
                ) : (
                    <>
                        <p style={{ color: "green" }}>Connected ✅</p>

                        <BlockEditor
                            blocks={blocks}
                            wsRef={wsRef}
                            liveRef={liveRef}
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
