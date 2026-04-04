import { useState, useRef, useCallback, useEffect } from 'react'
import './App.css'

const WS_URL = 'ws://localhost:8000/ws/voice'
const SILENCE_THRESHOLD = 15
const SILENCE_DURATION = 1500
const VIZ_BARS = 64
const VIZ_INNER_RADIUS = 88
const VIZ_MAX_BAR = 50

const LANG_MAP = {
  english: 'en-US', italian: 'it-IT', spanish: 'es-ES', french: 'fr-FR',
  german: 'de-DE', portuguese: 'pt-BR', dutch: 'nl-NL', russian: 'ru-RU',
  japanese: 'ja-JP', chinese: 'zh-CN', korean: 'ko-KR', arabic: 'ar-SA',
  hindi: 'hi-IN', turkish: 'tr-TR', polish: 'pl-PL', swedish: 'sv-SE',
  norwegian: 'nb-NO', danish: 'da-DK', finnish: 'fi-FI', greek: 'el-GR',
  czech: 'cs-CZ', romanian: 'ro-RO', hungarian: 'hu-HU', ukrainian: 'uk-UA',
}

const STATE_COLORS = {
  idle: { r: 59, g: 130, b: 246 },
  listening: { r: 239, g: 68, b: 68 },
  processing: { r: 245, g: 158, b: 11 },
  speaking: { r: 167, g: 139, b: 250 },
  muted: { r: 113, g: 113, b: 122 },
}

function getSupportedMimeType() {
  const types = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4']
  for (const type of types) {
    if (MediaRecorder.isTypeSupported(type)) return type
  }
  return ''
}

function pickVoice(langCode) {
  const voices = window.speechSynthesis.getVoices()
  if (!voices.length || !langCode) return null
  const lang = langCode.toLowerCase()
  return voices.find((v) => v.lang.toLowerCase().startsWith(lang.split('-')[0])) || null
}

function getStateKey(isConversing, isRecording, isMuted, status) {
  if (isMuted) return 'muted'
  if (isRecording) return 'listening'
  if (status === 'processing') return 'processing'
  if (status === 'speaking') return 'speaking'
  return 'idle'
}

function App() {
  const [isRecording, setIsRecording] = useState(false)
  const [isConversing, setIsConversing] = useState(false)
  const [isPTT, setIsPTT] = useState(false)
  const [isMuted, setIsMuted] = useState(false)
  const [status, setStatus] = useState('idle')
  const [error, setError] = useState(null)
  const [detectedLang, setDetectedLang] = useState(null)
  const [messages, setMessages] = useState([])
  const [timing, setTiming] = useState(null)

  const mediaRecorder = useRef(null)
  const audioChunks = useRef([])
  const isConversingRef = useRef(false)
  const isMutedRef = useRef(false)
  const streamRef = useRef(null)
  const audioContextRef = useRef(null)
  const analyserRef = useRef(null)
  const silenceCheckRef = useRef(null)
  const langRef = useRef(null)
  const canvasRef = useRef(null)
  const vizFrameRef = useRef(null)
  const chatEndRef = useRef(null)
  const wsRef = useRef(null)
  const speechQueueRef = useRef([])
  const isSpeakingRef = useRef(false)

  const stateKey = getStateKey(isConversing, isRecording, isMuted, status)
  const accent = STATE_COLORS[stateKey]

  useEffect(() => {
    window.speechSynthesis.getVoices()
    const onVoices = () => window.speechSynthesis.getVoices()
    window.speechSynthesis.addEventListener('voiceschanged', onVoices)
    return () => window.speechSynthesis.removeEventListener('voiceschanged', onVoices)
  }, [])

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    const root = document.documentElement
    root.style.setProperty('--accent-r', accent.r)
    root.style.setProperty('--accent-g', accent.g)
    root.style.setProperty('--accent-b', accent.b)
  }, [accent])

  const connectWS = useCallback(() => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) return

    const ws = new WebSocket(WS_URL)
    wsRef.current = ws

    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data)

      if (msg.type === 'transcript') {
        setMessages((prev) => [...prev, { role: 'user', text: msg.text }])
        if (msg.language) {
          langRef.current = msg.language
          setDetectedLang(msg.language)
        }
        setStatus('processing')
      }

      if (msg.type === 'reply_chunk') {
        speakSentence(msg.text)
      }

      if (msg.type === 'reply_done') {
        setTiming(msg.timing)
        if (msg.full_reply) {
          setMessages((prev) => [...prev, { role: 'assistant', text: msg.full_reply }])
        }
      }
    }

    ws.onclose = () => {
      wsRef.current = null
    }

    ws.onerror = () => {
      setError('WebSocket connection failed')
    }

    return ws
  }, [])

  const speakSentence = useCallback((text) => {
    speechQueueRef.current.push(text)
    if (!isSpeakingRef.current) {
      processQueue()
    }
  }, [])

  const processQueue = useCallback(() => {
    if (speechQueueRef.current.length === 0) {
      isSpeakingRef.current = false
      if (isConversingRef.current && !isMutedRef.current) {
        startRecording()
      } else {
        setStatus(isConversingRef.current ? 'muted' : 'idle')
      }
      return
    }

    isSpeakingRef.current = true
    setStatus('speaking')
    const text = speechQueueRef.current.shift()
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.rate = 1.05

    const langCode = langRef.current ? LANG_MAP[langRef.current] || langRef.current : null
    if (langCode) {
      utterance.lang = langCode
      const voice = pickVoice(langCode)
      if (voice) utterance.voice = voice
    }

    utterance.onend = () => processQueue()
    utterance.onerror = () => processQueue()
    window.speechSynthesis.speak(utterance)
  }, [])

  const stopSpeaking = useCallback(() => {
    window.speechSynthesis.cancel()
    speechQueueRef.current = []
    isSpeakingRef.current = false
  }, [])

  const startVisualizer = useCallback(() => {
    const canvas = canvasRef.current
    const analyser = analyserRef.current
    if (!canvas || !analyser) return

    const ctx = canvas.getContext('2d')
    const dpr = window.devicePixelRatio || 1
    const size = 320
    canvas.width = size * dpr
    canvas.height = size * dpr
    ctx.scale(dpr, dpr)

    const dataArray = new Uint8Array(analyser.frequencyBinCount)
    const smoothed = new Float32Array(VIZ_BARS).fill(0)

    const draw = () => {
      analyser.getByteFrequencyData(dataArray)
      ctx.clearRect(0, 0, size, size)

      const cx = size / 2
      const cy = size / 2

      for (let i = 0; i < VIZ_BARS; i++) {
        const dataIdx = Math.floor((i / VIZ_BARS) * dataArray.length)
        const raw = dataArray[dataIdx] / 255
        smoothed[i] += (raw - smoothed[i]) * 0.3

        const angle = (i / VIZ_BARS) * Math.PI * 2 - Math.PI / 2
        const barH = smoothed[i] * VIZ_MAX_BAR + 2

        const x1 = cx + Math.cos(angle) * VIZ_INNER_RADIUS
        const y1 = cy + Math.sin(angle) * VIZ_INNER_RADIUS
        const x2 = cx + Math.cos(angle) * (VIZ_INNER_RADIUS + barH)
        const y2 = cy + Math.sin(angle) * (VIZ_INNER_RADIUS + barH)

        const a = 0.2 + smoothed[i] * 0.8
        ctx.beginPath()
        ctx.moveTo(x1, y1)
        ctx.lineTo(x2, y2)
        ctx.strokeStyle = `rgba(${accent.r}, ${accent.g}, ${accent.b}, ${a})`
        ctx.lineWidth = 2.5
        ctx.lineCap = 'round'
        ctx.stroke()
      }

      vizFrameRef.current = requestAnimationFrame(draw)
    }

    vizFrameRef.current = requestAnimationFrame(draw)
  }, [accent])

  const stopVisualizer = useCallback(() => {
    cancelAnimationFrame(vizFrameRef.current)
  }, [])

  const stopAudioAnalysis = useCallback(() => {
    cancelAnimationFrame(silenceCheckRef.current)
    stopVisualizer()
    if (audioContextRef.current) {
      audioContextRef.current.close()
      audioContextRef.current = null
      analyserRef.current = null
    }
  }, [stopVisualizer])

  const stopRecording = useCallback(() => {
    stopAudioAnalysis()
    if (mediaRecorder.current && mediaRecorder.current.state === 'recording') {
      mediaRecorder.current.stop()
      setIsRecording(false)
    }
  }, [stopAudioAnalysis])

  const startSilenceDetection = useCallback(() => {
    const analyser = analyserRef.current
    if (!analyser) return

    const dataArray = new Uint8Array(analyser.frequencyBinCount)
    let silentSince = null

    const check = () => {
      analyser.getByteFrequencyData(dataArray)
      const average = dataArray.reduce((sum, v) => sum + v, 0) / dataArray.length

      if (average < SILENCE_THRESHOLD) {
        if (!silentSince) silentSince = Date.now()
        if (Date.now() - silentSince > SILENCE_DURATION) {
          stopRecording()
          return
        }
      } else {
        silentSince = null
      }

      silenceCheckRef.current = requestAnimationFrame(check)
    }

    silenceCheckRef.current = requestAnimationFrame(check)
  }, [stopRecording])

  const sendAudio = useCallback((blob) => {
    const ws = wsRef.current
    if (!ws || ws.readyState !== WebSocket.OPEN) return

    setStatus('processing')

    const reader = new FileReader()
    reader.onloadend = () => {
      const arrayBuffer = reader.result
      const hex = Array.from(new Uint8Array(arrayBuffer))
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

  const startRecording = useCallback(async () => {
    stopSpeaking()
    setError(null)

    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'interrupt' }))
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream

      const audioContext = new AudioContext()
      const source = audioContext.createMediaStreamSource(stream)
      const analyser = audioContext.createAnalyser()
      analyser.fftSize = 256
      source.connect(analyser)
      audioContextRef.current = audioContext
      analyserRef.current = analyser

      const mimeType = getSupportedMimeType()
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : {})

      audioChunks.current = []
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunks.current.push(e.data)
      }
      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop())
        const blob = new Blob(audioChunks.current, { type: recorder.mimeType })
        sendAudio(blob)
      }

      recorder.start()
      mediaRecorder.current = recorder
      setIsRecording(true)
      setStatus('listening')

      startVisualizer()

      if (!isPTT) {
        startSilenceDetection()
      }
    } catch (err) {
      setError('Microphone access denied')
      setStatus('idle')
    }
  }, [sendAudio, startSilenceDetection, startVisualizer, stopSpeaking, isPTT])

  const startConversation = useCallback(() => {
    connectWS()
    setTimeout(() => {
      isConversingRef.current = true
      setIsConversing(true)
      startRecording()
    }, 100)
  }, [connectWS, startRecording])

  const stopConversation = useCallback(() => {
    isConversingRef.current = false
    setIsConversing(false)
    stopSpeaking()
    stopAudioAnalysis()
    if (mediaRecorder.current && mediaRecorder.current.state === 'recording') {
      mediaRecorder.current.stop()
    }
    setIsRecording(false)
    setStatus('idle')
  }, [stopAudioAnalysis, stopSpeaking])

  const toggleMute = useCallback(() => {
    setIsMuted((prev) => {
      const next = !prev
      isMutedRef.current = next
      if (next) {
        stopAudioAnalysis()
        if (mediaRecorder.current && mediaRecorder.current.state === 'recording') {
          mediaRecorder.current.stop()
        }
        setIsRecording(false)
        setStatus('muted')
      } else if (isConversingRef.current) {
        startRecording()
      }
      return next
    })
  }, [stopAudioAnalysis, startRecording])

  const clearHistory = useCallback(() => {
    setMessages([])
    setError(null)
    setDetectedLang(null)
    setTiming(null)
    langRef.current = null
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'clear' }))
    }
  }, [])

  const statusLabel = {
    idle: 'TAP TO BEGIN',
    listening: 'LISTENING',
    processing: 'THINKING',
    speaking: 'SPEAKING',
    muted: 'MUTED',
  }[status] || status.toUpperCase()

  return (
    <div className="app" data-state={stateKey}>
      <div className="bg-blob bg-blob-1" />
      <div className="bg-blob bg-blob-2" />
      <div className="noise-overlay" />

      <header className="header">
        <h1 className="logo">KOSKI<span className="logo-accent">PLEX</span></h1>
        <div className="header-badges">
          {detectedLang && <span className="lang-pill">{detectedLang}</span>}
          {timing && (
            <span className="timing-pill">
              STT {timing.stt_ms}ms &middot; LLM {timing.llm_first_token_ms}ms &middot; Total {timing.total_ms}ms
            </span>
          )}
        </div>
      </header>

      <main className="main">
        <div className="orb-area">
          <canvas ref={canvasRef} className="viz-canvas" width="320" height="320" />
          <div className="orb-rings">
            <div className="ring ring-1" />
            <div className="ring ring-2" />
            <div className="ring ring-3" />
          </div>

          {isPTT ? (
            <button
              className="orb"
              onMouseDown={() => { connectWS(); setTimeout(startRecording, 50) }}
              onMouseUp={stopRecording}
              onTouchStart={(e) => { e.preventDefault(); connectWS(); setTimeout(startRecording, 50) }}
              onTouchEnd={(e) => { e.preventDefault(); stopRecording() }}
            />
          ) : (
            <button
              className="orb"
              onClick={isConversing ? stopConversation : startConversation}
            />
          )}
        </div>

        <p className="status-text">{statusLabel}</p>
        {error && <p className="error-text">{error}</p>}

        {messages.length > 0 && (
          <div className="chat">
            {messages.map((msg, i) => (
              <div key={i} className={`chat-bubble ${msg.role === 'user' ? 'chat-user' : 'chat-ai'}`}>
                <span className="chat-role">{msg.role === 'user' ? 'You' : 'KoskiPlex'}</span>
                <p className="chat-text">{msg.text}</p>
              </div>
            ))}
            <div ref={chatEndRef} />
          </div>
        )}
      </main>

      <footer className="controls">
        {isConversing && !isPTT && (
          <button className={`ctrl-btn ${isMuted ? 'ctrl-active' : ''}`} onClick={toggleMute} title={isMuted ? 'Unmute' : 'Mute'}>
            {isMuted ? (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="1" y1="1" x2="23" y2="23"/><path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"/><path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2c0 .76-.12 1.5-.35 2.18"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>
            ) : (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>
            )}
          </button>
        )}
        <label className="ctrl-toggle">
          <input type="checkbox" checked={isPTT} onChange={() => { if (isConversing) stopConversation(); setIsPTT((p) => !p) }} />
          <span className="ctrl-toggle-label">PTT</span>
        </label>
        <button className="ctrl-btn" onClick={clearHistory} title="Clear history">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
        </button>
      </footer>
    </div>
  )
}

export default App
