import { useRef, useCallback, useEffect, useState } from 'react'

const WS_URL = 'ws://localhost:8000/ws/voice'
const RECONNECT_DELAY = 2000
const MAX_RECONNECT_SAMPLES = 5

export function useVoiceWebSocket({ onTranscript, onReplyChunk, onAudioChunk, onReplyDone, onStatusChange, selectedVoice }) {
  const wsRef = useRef(null)
  const reconnectCountRef = useRef(0)
  const [isConnected, setIsConnected] = useState(false)

  const connect = useCallback(() => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) return

    const ws = new WebSocket(WS_URL)
    wsRef.current = ws

    ws.onopen = () => {
      console.log('Voice WebSocket connected')
      setIsConnected(true)
      reconnectCountRef.current = 0
      onStatusChange?.('idle')
      ws.send(JSON.stringify({ type: 'set_voice', ...selectedVoice }))
    }

    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data)
        switch (msg.type) {
          case 'transcript':
            onTranscript?.(msg)
            break
          case 'reply_chunk':
            onReplyChunk?.(msg)
            break
          case 'audio_chunk':
            onAudioChunk?.(msg.data)
            break
          case 'reply_done':
            onReplyDone?.(msg)
            break
          default:
            break
        }
      } catch (err) {
        console.error('WS message error:', err)
      }
    }

    ws.onclose = () => {
      console.log('Voice WebSocket closed')
      setIsConnected(false)
      wsRef.current = null
      
      if (reconnectCountRef.current < MAX_RECONNECT_SAMPLES) {
        const delay = RECONNECT_DELAY * Math.pow(1.5, reconnectCountRef.current)
        console.log(`Reconnecting in ${Math.round(delay)}ms...`)
        setTimeout(connect, delay)
        reconnectCountRef.current++
      }
    }

    ws.onerror = (e) => {
      console.error('WS error:', e)
      onStatusChange?.('error', 'Connection failed')
    }
  }, [selectedVoice, onTranscript, onReplyChunk, onAudioChunk, onReplyDone, onStatusChange])

  const sendAudio = useCallback((blob) => {
    const ws = wsRef.current
    if (!ws || ws.readyState !== WebSocket.OPEN) return

    const reader = new FileReader()
    reader.onloadend = () => {
      const hex = Array.from(new Uint8Array(reader.result))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('')
      ws.send(JSON.stringify({
        type: 'audio',
        data: hex,
        ext: blob.type.includes('mp4') ? 'mp4' : 'webm',
      }))
    }
    reader.readAsArrayBuffer(blob)
  }, [])

  const sendCommand = useCallback((cmd) => {
    const ws = wsRef.current
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(cmd))
    }
  }, [])

  useEffect(() => {
    connect()
    return () => {
      if (wsRef.current) {
        wsRef.current.close()
      }
    }
  }, [connect])

  // Update voice if selectedVoice changes
  useEffect(() => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'set_voice', ...selectedVoice }))
    }
  }, [selectedVoice])

  return {
    isConnected,
    sendAudio,
    sendCommand,
    ws: wsRef
  }
}
