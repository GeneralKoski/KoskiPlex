import React from 'react';

const VoicePanel = ({ voices, selectedVoice, onVoiceSelect, onUpload, onDelete, onClose, fileInputRef }) => {
  return (
    <div className="voice-panel">
      <div className="voice-panel-header">
        <span className="voice-panel-title">Voices</span>
        <button className="voice-panel-close" onClick={onClose}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      <div className="voice-section">
        <span className="voice-section-label">Default</span>
        <div className="voice-option" onClick={() => onVoiceSelect({ engine: 'edge', voice: '' })}>
          <span className={`voice-radio ${selectedVoice.engine === 'edge' && !selectedVoice.voice ? 'active' : ''}`} />
          <span className="voice-name">Auto (by language)</span>
        </div>
      </div>

      {voices.custom.length > 0 && (
        <div className="voice-section">
          <span className="voice-section-label">Custom</span>
          {voices.custom.map((v) => (
            <div key={v.name} className="voice-option">
              <div className="voice-option-main" onClick={() => onVoiceSelect({ engine: 'xtts', voice: v.name })}>
                <span className={`voice-radio ${selectedVoice.engine === 'xtts' && selectedVoice.voice === v.name ? 'active' : ''}`} />
                <span className="voice-name">{v.name}</span>
              </div>
              <button className="voice-delete" onClick={() => onDelete(v.name)}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <polyline points="3 6 5 6 21 6" />
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}

      <button className="voice-upload-btn" onClick={() => fileInputRef.current?.click()}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="17 8 12 3 7 8" />
          <line x1="12" y1="3" x2="12" y2="15" />
        </svg>
        Upload voice sample
      </button>
      <input
        ref={fileInputRef}
        type="file"
        accept=".wav,.mp3,.m4a"
        hidden
        onChange={onUpload}
      />
    </div>
  );
};

export default VoicePanel;
