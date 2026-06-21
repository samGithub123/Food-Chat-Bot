import React, { useState, useRef, useEffect } from 'react';
import { MessageCircle, X, Send, Camera, Sparkles, Trash } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export default function Chatbot() {
  const [isOpen, setIsOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [imageMime, setImageMime] = useState<string>('');
  
  const [messages, setMessages] = useState<{ text: string; isBot: boolean; imagePreview?: string }[]>([
    { 
      text: "Hi! I am the Food Fix customer service assistant. Ask me about refunds, delays, coupons, cancellations, or report a food quality issue.", 
      isBot: true 
    },
  ]);
  
  const [isLoading, setIsLoading] = useState(false);
  const [mustUploadImage, setMustUploadImage] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto scroll to bottom
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isLoading, isOpen]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      alert("Please upload an image file (PNG, JPG, JPEG, or WEBP).");
      return;
    }

    const reader = new FileReader();
    reader.onloadend = () => {
      setImageBase64(reader.result as string);
      setImageMime(file.type);
    };
    reader.readAsDataURL(file);
  };

  const handleTriggerUpload = () => {
    fileInputRef.current?.click();
  };

  const handleSend = async () => {
    if (!message.trim() && !imageBase64) return;

    const userText = message.trim();
    const newUserMsg = {
      text: userText || "Attached food quality photo:",
      isBot: false,
      imagePreview: imageBase64 || undefined
    };

    setMessages((prev) => [...prev, newUserMsg]);
    setMessage('');
    setIsLoading(true);
    setMustUploadImage(false);

    // Prepare payload
    let rawBase64 = null;
    let mimeType = '';
    if (imageBase64) {
      const parts = imageBase64.split(";base64,");
      mimeType = parts[0].replace("data:", "");
      rawBase64 = parts[1];
    }

    const payload = {
      query: userText || "Analyze this food quality photo.",
      image: rawBase64,
      mimeType: mimeType,
      history: messages.slice(-10) // passes the trailing conversation for context
    };

    // Clean attachment preview state
    setImageBase64(null);
    setImageMime('');

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (res.ok && data.text) {
        setMessages((prev) => [...prev, { text: data.text, isBot: true }]);
        if (data.requestImage) {
          setMustUploadImage(true);
        }
      } else {
        setMessages((prev) => [
          ...prev, 
          { 
            text: data.text || "Sorry, I am unable to connect. Let me route you to a human support agent.", 
            isBot: true 
          }
        ]);
      }
    } catch (error) {
      console.error("Chat error:", error);
      setMessages((prev) => [
        ...prev, 
        { 
          text: "I was unable to connect to our support servers. Let me route you to a human helper offline.", 
          isBot: true 
        }
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="fixed bottom-8 right-8 p-5 bg-orange-600 text-white rounded-full shadow-lg shadow-orange-500/30 z-50 hover:scale-105 active:scale-95 transition-transform flex items-center justify-center cursor-pointer"
        aria-label="Open Chatbot Support"
      >
        <MessageCircle size={28} />
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            className="fixed inset-4 sm:top-auto sm:bottom-28 sm:right-8 sm:left-auto sm:w-96 sm:h-[480px] bg-white shadow-2xl rounded-3xl border border-zinc-100 z-50 flex flex-col overflow-hidden"
          >
            {/* Header */}
            <div className="p-5 border-b border-zinc-100 flex justify-between items-center bg-zinc-900 text-white">
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                <h3 className="font-extrabold tracking-tight flex items-center gap-1.5 text-sm uppercase">
                  Food Fix Support <Sparkles size={14} className="text-orange-400" />
                </h3>
              </div>
              <button 
                onClick={() => setIsOpen(false)} 
                className="opacity-50 hover:opacity-100 p-1 hover:bg-zinc-800 rounded-full transition-colors cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {/* Messages Content */}
            <div className="flex-1 p-5 overflow-y-auto space-y-4 bg-zinc-50">
              {messages.map((msg, idx) => (
                <div
                  key={idx}
                  className={`flex flex-col max-w-[85%] ${msg.isBot ? '' : 'ml-auto'}`}
                >
                  <div
                    className={`p-4 rounded-2xl text-xs md:text-sm leading-relaxed shadow-sm ${
                      msg.isBot
                        ? 'bg-white text-zinc-800 rounded-tl-none border border-zinc-100'
                        : 'bg-orange-600 text-white rounded-tr-none'
                    }`}
                  >
                    {msg.imagePreview && (
                      <div className="mb-2 overflow-hidden rounded-xl bg-zinc-100 border border-zinc-200">
                        <img 
                          src={msg.imagePreview} 
                          alt="Uploaded attachment" 
                          className="w-full max-h-48 object-cover"
                        />
                      </div>
                    )}
                    <p className="whitespace-pre-line">{msg.text}</p>
                  </div>
                  <span className={`text-[10px] text-zinc-400 mt-1 px-1 ${msg.isBot ? '' : 'text-right'}`}>
                    {msg.isBot ? 'FoodFix Bot' : 'You'}
                  </span>
                </div>
              ))}

              {isLoading && (
                <div className="flex flex-col max-w-[85%]">
                  <div className="p-4 rounded-2xl text-xs md:text-sm bg-white text-zinc-500 rounded-tl-none border border-zinc-100 flex items-center gap-2 shadow-sm">
                    <span className="flex gap-1">
                      <span className="h-1.5 w-1.5 bg-zinc-400 rounded-full animate-bounce [animation-delay:-0.3s]"></span>
                      <span className="h-1.5 w-1.5 bg-zinc-400 rounded-full animate-bounce [animation-delay:-0.15s]"></span>
                      <span className="h-1.5 w-1.5 bg-zinc-400 rounded-full animate-bounce"></span>
                    </span>
                    <span className="font-medium text-xs">Analyzing and drafting secure answer...</span>
                  </div>
                </div>
              )}
              
              <div ref={messagesEndRef} />
            </div>

            {/* File upload hidden input */}
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              accept="image/*"
              className="hidden"
            />

            {/* Upload preview layer */}
            {imageBase64 && (
              <div className="px-5 py-3 border-t border-zinc-100 flex items-center justify-between bg-orange-50 animate-fade-in">
                <div className="flex items-center gap-3">
                  <img 
                    src={imageBase64} 
                    alt="Current upload preview" 
                    className="w-12 h-12 rounded-xl object-cover border border-orange-200 shadow-sm"
                  />
                  <div>
                    <p className="text-xs font-bold text-orange-950">Food photo selected</p>
                    <p className="text-[10px] text-orange-700">Ready for automated inspection</p>
                  </div>
                </div>
                <button
                  onClick={() => { setImageBase64(null); setImageMime(''); }}
                  className="p-1.5 hover:bg-orange-100 rounded-full text-orange-800 transition-colors cursor-pointer"
                  title="Remove photo"
                >
                  <Trash size={16} />
                </button>
              </div>
            )}

            {/* Must upload warning */}
            {mustUploadImage && !imageBase64 && (
              <div className="px-5 py-2.5 bg-amber-50 text-amber-900 border-t border-amber-100 text-[11px] font-medium flex items-center justify-between animate-pulse">
                <span>⚠️ Please click key camera button below to attach food photo</span>
                <button 
                  onClick={handleTriggerUpload}
                  className="bg-amber-600 text-white px-2 py-0.5 rounded-md font-bold text-[10px] hover:bg-amber-700 transition"
                >
                  Attach
                </button>
              </div>
            )}

            {/* Input Footer bar */}
            <div className="p-4 border-t border-zinc-100 bg-white flex gap-2 items-center">
              <button
                type="button"
                onClick={handleTriggerUpload}
                className={`p-3 rounded-full transition-all cursor-pointer ${
                  mustUploadImage 
                    ? "bg-amber-100 text-amber-800 hover:bg-amber-200 animate-bounce" 
                    : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
                }`}
                title="Upload/Take food quality photo"
              >
                <Camera size={18} />
              </button>
              
              <input
                type="text"
                placeholder={mustUploadImage ? "Click camera to upload food quality photo..." : "Ask support or describe query..."}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                disabled={isLoading}
                className="flex-1 bg-zinc-100 border-none rounded-full px-4 py-2.5 text-xs md:text-sm focus:outline-none focus:ring-1 focus:ring-orange-500 placeholder-zinc-400"
              />
              
              <button
                onClick={handleSend}
                disabled={isLoading || (!message.trim() && !imageBase64)}
                className="bg-orange-600 text-white p-3 rounded-full hover:bg-orange-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
              >
                <Send size={16} />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
