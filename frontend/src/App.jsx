import { useState, useRef, useCallback } from 'react'
import './App.css'

const API_URL = 'http://localhost:8000'
const MAX_HISTORY = 20

function getSupportedMimeType() {
  const types = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4']
  for (const type of types) {
    if (MediaRecorder.isTypeSupported(type)) return type
  }
  return ''
}

function App() {
  const [isRecording, setIsRecording] = useState(false)
  const [isAutoVoice, setIsAutoVoice] = useState(false)
  const [transcript, setTranscript] = useState('')
  const [reply, setReply] = useState('')
  const [status, setStatus] = useState('Ready')
  const [error, setError] = useState(null)

  const mediaRecorder = useRef(null)
  const audioChunks = useRef([])
  const history = useRef([])
  const isAutoVoiceRef = useRef(false)
  const streamRef = useRef(null)

  const speakReply = useCallback((text) => {
    window.speechSynthesis.cancel()
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.rate = 1.1
    utterance.onstart = () => setStatus('Speaking...')
    utterance.onend = () => {
      setStatus('Ready')
      if (isAutoVoiceRef.current) {
        startRecording()
      }
    }
    window.speechSynthesis.speak(utterance)
  }, [])

  const handleAudioReady = useCallback(async (blob) => {
    setStatus('Processing...')
    setError(null)

    const formData = new FormData()
    const ext = blob.type.includes('mp4') ? 'mp4' : 'webm'
    formData.append('file', blob, `recording.${ext}`)
    formData.append('history', JSON.stringify(history.current))

    try {
      const res = await fetch(`${API_URL}/voice`, {
        method: 'POST',
        body: formData,
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.detail || 'Request failed')
      }

      const data = await res.json()
      setTranscript(data.transcript)
      setReply(data.reply)

      history.current.push(
        { role: 'user', content: data.transcript },
        { role: 'assistant', content: data.reply }
      )
      if (history.current.length > MAX_HISTORY) {
        history.current = history.current.slice(-MAX_HISTORY)
      }

      speakReply(data.reply)
    } catch (err) {
      setError(err.message)
      setStatus('Ready')
    }
  }, [speakReply])

  const startRecording = useCallback(async () => {
    window.speechSynthesis.cancel()
    setError(null)

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      const mimeType = getSupportedMimeType()
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : {})

      audioChunks.current = []
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunks.current.push(e.data)
      }
      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop())
        const blob = new Blob(audioChunks.current, { type: recorder.mimeType })
        handleAudioReady(blob)
      }

      recorder.start()
      mediaRecorder.current = recorder
      setIsRecording(true)
      setStatus('Recording...')
    } catch (err) {
      setError('Microphone access denied')
      setStatus('Ready')
    }
  }, [handleAudioReady])

  const stopRecording = useCallback(() => {
    if (mediaRecorder.current && mediaRecorder.current.state === 'recording') {
      mediaRecorder.current.stop()
      setIsRecording(false)
    }
  }, [])

  const toggleAutoVoice = useCallback(() => {
    setIsAutoVoice((prev) => {
      isAutoVoiceRef.current = !prev
      return !prev
    })
  }, [])

  const clearHistory = useCallback(() => {
    history.current = []
    setTranscript('')
    setReply('')
    setError(null)
    setStatus('Ready')
    window.speechSynthesis.cancel()
  }, [])

  return (
    <div className="app">
      <h1 className="title">KoskiPlex</h1>
      <p className="subtitle">Voice AI — Powered by Groq</p>

      <p className="status">{status}</p>

      <button
        className={`ptt-button ${isRecording ? 'recording' : ''}`}
        onMouseDown={startRecording}
        onMouseUp={stopRecording}
        onTouchStart={(e) => { e.preventDefault(); startRecording() }}
        onTouchEnd={(e) => { e.preventDefault(); stopRecording() }}
      >
        {isRecording ? '🎙 Release to Send' : '🎤 Hold to Talk'}
      </button>

      <div className="controls">
        <label className="toggle">
          <input
            type="checkbox"
            checked={isAutoVoice}
            onChange={toggleAutoVoice}
          />
          Auto-Voice
        </label>
        <button className="clear-btn" onClick={clearHistory}>
          Clear History
        </button>
      </div>

      {error && <div className="error">{error}</div>}

      <div className="conversation">
        {transcript && (
          <div className="message user-msg">
            <span className="label">You:</span> {transcript}
          </div>
        )}
        {reply && (
          <div className="message ai-msg">
            <span className="label">KoskiPlex:</span> {reply}
          </div>
        )}
      </div>
    </div>
  )
}

export default App
