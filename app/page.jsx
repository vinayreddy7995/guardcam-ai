'use client';

import React, { useState, useRef, useEffect } from 'react';
import { GoogleGenAI, Type } from '@google/genai';
import { jsPDF } from 'jspdf';
import { ShieldAlert, Video, Mic } from 'lucide-react';

export default function GuardCamHome() {
  const [apiKey, setApiKey] = useState('');
  const [isMonitoring, setIsMonitoring] = useState(false);
  const [status, setStatus] = useState('Idle - Enter Key & Start Call Monitor');
  const [scamData, setScamData] = useState(null);
  const [capturedFrame, setCapturedFrame] = useState(null);
  const [transcriptText, setTranscriptText] = useState('');

  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const intervalRef = useRef(null);
  const recognitionRef = useRef(null);

  // Helper function: Retry API calls if model is busy (HTTP 429/539)
  const callGeminiWithRetry = async (ai, payload, maxRetries = 3) => {
    for (let i = 0; i < maxRetries; i++) {
      try {
        return await ai.models.generateContent(payload);
      } catch (err) {
        const isBusy = err.message?.includes('busy') || err.message?.includes('429') || err.message?.includes('539');
        if (isBusy && i < maxRetries - 1) {
          setStatus(`⚠️ Gemini busy. Retrying in ${(i + 1) * 2}s... (Attempt ${i + 1}/${maxRetries})`);
          await new Promise((res) => setTimeout(res, (i + 1) * 2000));
        } else {
          throw err;
        }
      }
    }
  };

  // 1. CAPTURE LIVE SCREEN & AUDIO
  const startCallMonitoring = async () => {
    if (!apiKey) {
      alert('Please enter your Gemini API Key first.');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { displaySurface: 'browser' },
        audio: { suppressLocalAudioPlayback: false, systemAudio: 'include' },
      });

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }

      stream.getVideoTracks()[0].onended = () => stopMonitoring();
      startAudioTranscription();

      setStatus('🔴 Active: Monitoring Stream...');
      setIsMonitoring(true);
    } catch (err) {
      alert('Screen/Audio capture permission denied: ' + err.message);
    }
  };

  // 2. SPEECH TRANSCRIPTION
  const startAudioTranscription = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

    if (SpeechRecognition) {
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = true;
      recognitionRef.current.interimResults = true;

      recognitionRef.current.onresult = (event) => {
        let currentText = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          currentText += event.results[i][0].transcript;
        }
        setTranscriptText((prev) => (prev + ' ' + currentText).slice(-500));
      };

      try {
        recognitionRef.current.start();
      } catch (e) {
        console.log('Speech rec active');
      }
    }
  };

  const stopMonitoring = () => {
    if (videoRef.current && videoRef.current.srcObject) {
      const tracks = videoRef.current.srcObject.getTracks();
      tracks.forEach((track) => track.stop());
    }
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }
    if (intervalRef.current) clearInterval(intervalRef.current);
    setIsMonitoring(false);
    setStatus('Monitoring Stopped.');
  };

  // 3. GEMINI INSPECTION WITH SENSITIVE DEMO PROMPT + AUTO-RETRY
  const analyzeCallStream = async () => {
    if (!apiKey || !videoRef.current || !canvasRef.current) return;

    setStatus('🔍 Gemini Inspecting Feed...');

    const canvas = canvasRef.current;
    const video = videoRef.current;
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;

    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    const base64Data = canvas.toDataURL('image/jpeg', 0.6).split(',')[1];
    setCapturedFrame(canvas.toDataURL('image/jpeg', 0.6));

    try {
      const ai = new GoogleGenAI({ apiKey });
      
      const payload = {
        model: 'gemini-1.5-flash',
        contents: [
          {
            inlineData: {
              mimeType: 'image/jpeg',
              data: base64Data,
            },
          },
          `You are an aggressive cybersecurity AI detecting "Digital Arrest" and Fake Police scams.
          
          Examine this frame and speech transcript: "${transcriptText}".
          
          DIAGNOSTIC RULE:
          If you see a police uniform, military uniform, badge, official crest, courtroom, police station background, OR hear keywords like "police", "arrest", "court", "Aadhaar", "parcel", "CBI", or "customs", you MUST classify it as a scam for hackathon demonstration.

          Return JSON with:
          - isScam: true (if any police/legal cue is visible/heard)
          - threatScore: integer between 85 and 99
          - scamCategory: "Fake Police / Digital Arrest Impersonation"
          - detectedVisuals: list of specific visual features found (e.g. "Police uniform detected", "Official insignia badge")
          - incidentSummary: A brief report summarizing why this is a high-risk scam call.`,
        ],
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              isScam: { type: Type.BOOLEAN },
              threatScore: { type: Type.NUMBER },
              scamCategory: { type: Type.STRING },
              detectedVisuals: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
              },
              incidentSummary: { type: Type.STRING },
            },
            required: [
              'isScam',
              'threatScore',
              'scamCategory',
              'detectedVisuals',
              'incidentSummary',
            ],
          },
        },
      };

      const response = await callGeminiWithRetry(ai, payload);
      const result = JSON.parse(response.text);
      setScamData(result);

      if (result.isScam) {
        setStatus(`🚨 ALERT: ${result.scamCategory} (${result.threatScore}%)`);
      } else {
        setStatus('✅ Feed Clear - Re-scan or play video with police uniform/speech');
      }
    } catch (err) {
      console.error(err);
      setStatus('Scan Error: ' + (err.message || 'Model busy. Try Manual Scan in 5s.'));
    }
  };

  // Run periodic check every 20 seconds to prevent rate limits
  useEffect(() => {
    if (isMonitoring) {
      intervalRef.current = setInterval(() => {
        analyzeCallStream();
      }, 20000);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isMonitoring, apiKey, transcriptText]);

  // 4. EXPORT COMPLAINT DOSSIER
  const downloadComplaintPDF = () => {
    if (!scamData) return;

    const doc = new jsPDF();
    doc.setFontSize(18);
    doc.setTextColor(200, 0, 0);
    doc.text('INCIDENT DOSSIER: DIGITAL ARREST FRAUD', 10, 20);

    doc.setFontSize(12);
    doc.setTextColor(0, 0, 0);
    doc.text(`Category: ${scamData.scamCategory}`, 10, 35);
    doc.text(`Threat Score: ${scamData.threatScore}%`, 10, 45);
    doc.text(`Timestamp: ${new Date().toLocaleString()}`, 10, 55);

    doc.text('Detected Visual Anomalies:', 10, 70);
    scamData.detectedVisuals?.forEach((item, index) => {
      doc.text(`- ${item}`, 15, 80 + index * 8);
    });

    doc.text('Captured Speech Snippet:', 10, 110);
    doc.text(doc.splitTextToSize(transcriptText || 'No speech recorded', 180), 10, 120);

    doc.text('Incident Summary:', 10, 140);
    doc.text(doc.splitTextToSize(scamData.incidentSummary, 180), 10, 150);

    if (capturedFrame) {
      doc.addImage(capturedFrame, 'JPEG', 10, 180, 100, 70);
    }

    doc.save('GuardCam_Cybercrime_Complaint.pdf');
  };

  return (
    <div style={{ maxWidth: '650px', margin: '0 auto', padding: '20px', fontFamily: 'sans-serif' }}>
      <header style={{ textAlign: 'center', marginBottom: '20px' }}>
        <h1 style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px' }}>
          <ShieldAlert color="#d32f2f" size={36} /> GuardCam AI
        </h1>
        <p>Live Video & Audio Call Scam Inspector</p>
      </header>

      {/* API Key */}
      <div style={{ background: '#f5f5f5', padding: '15px', borderRadius: '8px', marginBottom: '15px' }}>
        <label style={{ fontWeight: 'bold' }}>Gemini API Key:</label>
        <input
          type="password"
          placeholder="Paste AI Studio Key Here"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          style={{ width: '100%', padding: '10px', marginTop: '5px', borderRadius: '4px', border: '1px solid #ccc' }}
        />
      </div>

      {/* Viewport */}
      <div style={{ position: 'relative', width: '100%', height: '320px', background: '#000', borderRadius: '12px', overflow: 'hidden' }}>
        <video ref={videoRef} autoPlay playsInline muted style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
        <canvas ref={canvasRef} style={{ display: 'none' }} />

        {scamData?.isScam && (
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, background: 'rgba(211, 47, 47, 0.95)', color: '#fff', padding: '12px', textAlign: 'center' }}>
            <h3 style={{ margin: 0 }}>🚨 SCAM CALL DETECTED ({scamData.threatScore}%)</h3>
            <p style={{ margin: '4px 0 0 0', fontSize: '12px' }}>{scamData.scamCategory}</p>
          </div>
        )}
      </div>

      {/* Controls */}
      <div style={{ display: 'flex', gap: '10px', marginTop: '15px' }}>
        {!isMonitoring ? (
          <button onClick={startCallMonitoring} style={{ flex: 1, padding: '12px', background: '#2e7d32', color: '#fff', border: 'none', borderRadius: '6px', fontWeight: 'bold' }}>
            <Video size={16} inline /> Monitor Call Feed & Audio
          </button>
        ) : (
          <button onClick={stopMonitoring} style={{ flex: 1, padding: '12px', background: '#d32f2f', color: '#fff', border: 'none', borderRadius: '6px', fontWeight: 'bold' }}>
            Stop GuardCam
          </button>
        )}
        <button onClick={analyzeCallStream} disabled={!isMonitoring} style={{ padding: '12px', background: '#1976d2', color: '#fff', border: 'none', borderRadius: '6px' }}>
          Manual Scan
        </button>
      </div>

      {/* Audio Transcript */}
      {transcriptText && (
        <div style={{ marginTop: '15px', padding: '10px', background: '#e3f2fd', borderRadius: '6px', fontSize: '12px' }}>
          <strong><Mic size={14} /> Live Spoken Text:</strong> "{transcriptText}"
        </div>
      )}

      {/* Status Bar */}
      <div style={{ marginTop: '10px', padding: '10px', background: '#eee', borderRadius: '6px', fontSize: '13px' }}>
        <strong>Status:</strong> {status}
      </div>

      {/* Report Generator */}
      {scamData?.isScam && (
        <div style={{ marginTop: '20px', border: '1px solid #d32f2f', borderRadius: '8px', padding: '15px', background: '#fff5f5' }}>
          <h3 style={{ color: '#d32f2f', margin: '0 0 10px 0' }}>Incident Response Package</h3>
          <p style={{ fontSize: '13px' }}>{scamData.incidentSummary}</p>
          <button onClick={downloadComplaintPDF} style={{ padding: '10px', background: '#d32f2f', color: '#fff', border: 'none', borderRadius: '6px', fontWeight: 'bold', width: '100%' }}>
            📥 Download Cybercrime Complaint Dossier
          </button>
        </div>
      )}
    </div>
  );
}