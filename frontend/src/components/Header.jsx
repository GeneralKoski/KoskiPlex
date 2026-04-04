import React from 'react';

const Header = ({ detectedLang, timing }) => {
  return (
    <header className="header">
      <h1 className="logo">KOSKI<span className="logo-accent">PLEX</span></h1>
      <div className="header-badges">
        {detectedLang && <span className="lang-pill">{detectedLang}</span>}
        {timing && (
          <span className="timing-pill">
            STT {timing.stt_ms}ms · LLM {timing.llm_first_token_ms}ms · Total {timing.total_ms}ms
          </span>
        )}
      </div>
    </header>
  );
};

export default Header;
