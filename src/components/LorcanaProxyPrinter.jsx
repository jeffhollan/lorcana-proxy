
import { useState, useRef } from 'react';
import 'bootstrap/dist/css/bootstrap.min.css';
import jsPDF from 'jspdf';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

export default function LorcanaProxyPrinter() {
    const [cards, setCards] = useState([]);
    const [cardUrl, setCardUrl] = useState('');
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState([]);
    const [isSearching, setIsSearching] = useState(false);
    const [showResults, setShowResults] = useState(false);
    const [currentPage, setCurrentPage] = useState(1);
    const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);
    const fileInputRef = useRef(null);


    // Try multiple CORS proxies for best reliability
    const corsProxies = [
        url => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
        url => `https://corsproxy.io/?${encodeURIComponent(url)}`,
        url => `https://thingproxy.freeboard.io/fetch/${url}`,
    ];

    // Try each proxy in order until one works (for image loading)
    const corsProxyUrl = (url, attempt = 0) => {
        if (attempt >= corsProxies.length) return corsProxies[0](url); // fallback to first
        return corsProxies[attempt](url);
    };

    const searchCards = async () => {
        if (!searchQuery.trim()) {
            setSearchResults([]);
            setShowResults(false);
            return;
        }

        setIsSearching(true);
        try {
            const response = await fetch(`https://api.lorcast.com/v0/cards/search?q=${encodeURIComponent(searchQuery)}`);
            if (response.ok) {
                const data = await response.json();
                // The API returns results inside the 'results' object
                setSearchResults(data.results || []);
                setShowResults(true);
            } else {
                console.error('Search error:', response.status);
                setSearchResults([]);
            }
        } catch (error) {
            console.error('Search error:', error);
            setSearchResults([]);
        } finally {
            setIsSearching(false);
        }
    };

    const addCardFromSearch = (cardData) => {
        const newCard = {
            id: Date.now(),
            src: cardData.image_uris.digital.normal, // Save the original URL, not proxied
            type: 'search',
            name: cardData.name,
            set: cardData.set.name
        };
    }


    const addCardFromUrl = async () => {
        if (!cardUrl.trim()) {
            toast.error('Please enter a valid URL');
            return;
        }
        try {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.src = cardUrl.trim(); // Salva l'URL originale, non proxato
            await new Promise((resolve, reject) => {
                img.onload = resolve;
                img.onerror = reject;
            });
            const newCard = {
                id: Date.now(),
                src: cardUrl.trim(),
                type: 'url'
            };
            setCards([...cards, newCard]);
            setCardUrl('');
            toast.success('Card added successfully!');
        } catch (error) {
            toast.error('Error loading the image');
        }
    };

    const handleFileUpload = (event) => {
        const files = Array.from(event.target.files);
        files.forEach(file => {
            const reader = new FileReader();
            reader.onload = (e) => {
                const newCard = {
                    id: Date.now() + Math.random(),
                    src: e.target.result,
                    type: 'file',
                    name: file.name
                };
                setCards(prev => {
                    const updated = [...prev, newCard];
                    setCurrentPage(Math.ceil(updated.length / 9));
                    return updated;
                });
                toast.success('Card uploaded successfully!');
            };
            reader.readAsDataURL(file);
        });
        // Reset file input
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
    };

    const removeCard = (cardId) => {
        setCards(cards.filter(card => card.id !== cardId));
        toast.info('Card removed');
    };


    const clearAllCards = () => {
        setCards([]);
        setCardUrl('');
        setSearchQuery('');
        setSearchResults([]);
        setShowResults(false);
    };

    // Clipboard import logic
    const importFromClipboard = async () => {
        let text = '';
        try {
            text = await navigator.clipboard.readText();
        } catch (e) {
            toast.error('Could not read clipboard.');
            return;
        }
        if (!text.trim()) {
            toast.error('Clipboard is empty.');
            return;
        }
        const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
        if (!lines.length) {
            toast.error('No valid lines found in clipboard.');
            return;
        }
        let newCards = [...cards];
        for (const line of lines) {
            // Parse: quantity name - version
            const match = line.match(/^(\d+)\s+([^\-]+?)(?:\s*-\s*(.+))?$/);
            if (!match) continue;
            const quantity = parseInt(match[1], 10);
            const name = match[2].trim();
            const version = match[3] ? match[3].trim() : '';
            try {
                const res = await fetch(`https://api.lorcast.com/v0/cards/search?q=${encodeURIComponent(name)}`);
                if (!res.ok) continue;
                const data = await res.json();
                const results = data.results || [];
                let cardObj = null;
                if (version) {
                    cardObj = results.find(c => c.version && c.version.toLowerCase() === version.toLowerCase());
                }
                if (!cardObj && results.length) {
                    cardObj = results[0]; // fallback to first result
                }
                if (cardObj && cardObj.image_uris && cardObj.image_uris.digital && cardObj.image_uris.digital.normal) {
                    for (let i = 0; i < quantity; i++) {
                        newCards.push({
                            id: Date.now() + Math.random(),
                            src: cardObj.image_uris.digital.normal,
                            type: 'import',
                            name: cardObj.name,
                            set: cardObj.set?.name || '',
                            version: cardObj.version || ''
                        });
                    }
                }
            } catch (e) {
                // skip on error
            }
        }
        setCards(newCards);
        setCurrentPage(Math.ceil(newCards.length / 9) || 1);
        toast.success('Imported cards from clipboard!');
    };

    const generatePDF = async () => {
        if (cards.length === 0) {
            alert('Add at least one card before generating the PDF!');
            return;
        }
        setIsGeneratingPDF(true);
        try {
            // PDF and card layout constants
            const cardWidthMM = 64;
            const cardHeightMM = 89;
            const cardsPerRow = 3;
            const cardsPerCol = 3;
            const spacingMM = 0;
            // Letter size: 8.5 x 11 inches = 215.9 x 279.4 mm
            const pageWidthMM = 215.9;
            const pageHeightMM = 279.4;
            const DPI = 150;
            const mmToPx = mm => Math.round(mm / 25.4 * DPI);


            // Helper: try to get image from DOM, else load with retry
            // Load image with retry and CORS proxy cycling (no DOM lookup)
            const loadImageWithRetryAndProxies = (src, retries = 5, delay = 400) => {
                const isDataOrBlob = src.startsWith('data:') || src.startsWith('blob:');
                return new Promise((resolve, reject) => {
                    let attempts = 0;
                    let proxyAttempt = 0;
                    function tryLoad() {
                        const img = new window.Image();
                        img.crossOrigin = 'anonymous';
                        img.onload = () => resolve(img);
                        img.onerror = () => {
                            if (attempts < retries) {
                                attempts++;
                                proxyAttempt = (proxyAttempt + 1) % corsProxies.length;
                                setTimeout(tryLoad, delay);
                            } else {
                                reject(new Error('Image not loaded: ' + src));
                            }
                        };
                        if (isDataOrBlob) {
                            img.src = src;
                        } else {
                            img.src = corsProxyUrl(src, proxyAttempt);
                        }
                    }
                    tryLoad();
                });
            };

            // Preload all images in parallel (just load with retry and proxies)
            const imagePromises = cards.map(card =>
                loadImageWithRetryAndProxies(card.src).then(img => ({ img, error: null })).catch(error => ({ img: null, error }))
            );
            const loadedImages = await Promise.all(imagePromises);

            const pdf = new jsPDF({
                orientation: 'portrait',
                unit: 'mm',
                format: 'letter'
            });

            const totalPages = Math.ceil(cards.length / 9);
            for (let page = 0; page < totalPages; page++) {
                const canvas = document.createElement('canvas');
                canvas.width = Math.round(pageWidthMM / 25.4 * DPI);
                canvas.height = Math.round(pageHeightMM / 25.4 * DPI);
                const ctx = canvas.getContext('2d');
                ctx.fillStyle = '#ffffff';
                ctx.fillRect(0, 0, canvas.width, canvas.height);

                const totalGridWidth = cardWidthMM * cardsPerRow;
                const totalGridHeight = cardHeightMM * cardsPerCol;
                // Center grid if page is larger than grid, else start at 0
                const marginX = Math.max(0, (pageWidthMM - totalGridWidth) / 2);
                const marginY = Math.max(0, (pageHeightMM - totalGridHeight) / 2);

                for (let i = 0; i < 9; i++) {
                    const cardIndex = page * 9 + i;
                    if (cardIndex >= cards.length) break;
                    const row = Math.floor(i / 3);
                    const col = i % 3;
                    const xMM = marginX + col * (cardWidthMM + spacingMM);
                    const yMM = marginY + row * (cardHeightMM + spacingMM);
                    const x = mmToPx(xMM);
                    const y = mmToPx(yMM);
                    const w = mmToPx(cardWidthMM);
                    const h = mmToPx(cardHeightMM);
                    const loaded = loadedImages[cardIndex];
                    if (loaded && loaded.img) {
                        // Draw loaded image
                        let drawWidth = w;
                        let drawHeight = h;
                        const imgRatio = loaded.img.width / loaded.img.height;
                        const cardRatio = w / h;
                        if (imgRatio > cardRatio) {
                            drawHeight = drawWidth / imgRatio;
                        } else {
                            drawWidth = drawHeight * imgRatio;
                        }
                        const xOffset = x + (w - drawWidth) / 2;
                        const yOffset = y + (h - drawHeight) / 2;
                        ctx.drawImage(loaded.img, xOffset, yOffset, drawWidth, drawHeight);
                        ctx.strokeStyle = '#000000';
                        ctx.lineWidth = 2;
                        ctx.strokeRect(x, y, w, h);
                    } else {
                        // Draw error placeholder
                        ctx.fillStyle = '#cccccc';
                        ctx.fillRect(x, y, w, h);
                        ctx.strokeStyle = '#000000';
                        ctx.lineWidth = 2;
                        ctx.strokeRect(x, y, w, h);
                        ctx.fillStyle = '#333';
                        ctx.font = 'bold 16px Arial';
                        ctx.fillText('Image not found', x + 10, y + h / 2);
                    }
                }
                const imgData = canvas.toDataURL('image/jpeg', 0.92);
                if (page > 0) pdf.addPage();
                pdf.addImage(imgData, 'JPEG', 0, 0, pageWidthMM, pageHeightMM);
            }
            pdf.autoPrint();
            const pdfBlob = pdf.output('blob');
            const pdfUrl = URL.createObjectURL(new Blob([pdfBlob], { type: 'application/pdf' }));
            window.open(pdfUrl, '_blank');
        } catch (error) {
            console.error('Error generating PDF:', error);
            let failedImages = [];
            if (typeof error === 'object' && error && error.failedImages) {
                failedImages = error.failedImages;
            }
            let msg = 'Error generating the PDF. Make sure all card images are accessible.';
            if (failedImages.length > 0) {
                msg += '\nFailed images:\n' + failedImages.join('\n');
            }
            alert(msg);
        } finally {
            setIsGeneratingPDF(false);
        }
    };

    const renderCardSlots = () => {
        const slots = [];
        const startIdx = (currentPage - 1) * 9;
        for (let i = 0; i < 9; i++) {
            const card = cards[startIdx + i];
            slots.push(
                <div key={i} className="col-md-4 mb-3 d-flex justify-content-center">
                    <div className={`card-slot ${card ? 'filled' : ''}`} style={{
                        aspectRatio: '2.5/3.5',
                        width: '100%',
                        maxWidth: '260px',
                        border: card ? '2px solid #20c997' : '2px dashed rgba(255,255,255,0.3)',
                        borderRadius: '10px',
                        position: 'relative',
                        background: card ? '#1a1a2e' : 'rgba(255,255,255,0.05)',
                        overflow: 'hidden',
                        display: 'flex',
                        alignItems: 'stretch',
                        justifyContent: 'center',
                        margin: '0 auto',
                        boxShadow: card ? '0 2px 8px rgba(0,0,0,0.15)' : 'none'
                    }}>
                        {card ? (
                            <>
                                <img
                                    src={card.src}
                                    alt={`Carta ${startIdx + i + 1}`}
                                    style={{
                                        width: '100%',
                                        height: '100%',
                                        objectFit: 'cover',
                                        borderRadius: '10px',
                                        display: 'block',
                                        background: '#1a1a2e'
                                    }}
                                    onError={(e) => {
                                        e.target.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjZGRkIi8+PHRleHQgeD0iNTAlIiB5PSI1MCUiIGZvbnQtZmFtaWx5PSJBcmlhbCwgc2Fucy1zZXJpZiIgZm9udC1zaXplPSIxNCIgZmlsbD0iIzk5OSIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZHk9Ii4zZW0iPkVycm9yZTwvdGV4dD48L3N2Zz4=';
                                    }}
                                />
                                <button
                                    className="btn btn-danger btn-sm remove-card"
                                    onClick={() => removeCard(card.id)}
                                    style={{
                                        position: 'absolute',
                                        top: '5px',
                                        right: '5px',
                                        borderRadius: '50%',
                                        width: '30px',
                                        height: '30px',
                                        padding: '0',
                                        fontSize: '12px',
                                        zIndex: 2
                                    }}
                                >
                                    ×
                                </button>
                            </>
                        ) : (
                            <div className="text-muted text-center w-100 h-100 d-flex flex-column align-items-center justify-content-center">
                                <div style={{ fontSize: '24px', marginBottom: '10px' }}>🃏</div>
                                <small>Slot {startIdx + i + 1}</small>
                            </div>
                        )}
                    </div>
                </div>
            );
        }
        return slots;
    };

    // ...existing code...
    return (
        <div style={{
            minHeight: '100vh',
            background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)',
            color: 'white',
            fontFamily: 'Georgia, serif'
        }}>
            {/* Stelle animate di sfondo */}
            <div style={{
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                background: `url("data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><defs><radialGradient id='star' cx='50%' cy='50%'><stop offset='0%' style='stop-color:%23ffd700;stop-opacity:0.8'/><stop offset='100%' style='stop-color:%23ffd700;stop-opacity:0'/></radialGradient></defs><circle cx='20' cy='30' r='1' fill='url(%23star)'/><circle cx='80' cy='20' r='0.5' fill='url(%23star)'/><circle cx='60' cy='70' r='0.8' fill='url(%23star)'/><circle cx='30' cy='80' r='0.6' fill='url(%23star)'/><circle cx='90' cy='60' r='0.4' fill='url(%23star)'/></svg>") repeat`,
                pointerEvents: 'none',
                opacity: 0.3,
                animation: 'twinkle 4s ease-in-out infinite'
            }} />

            <div className="container py-4" style={{ position: 'relative', zIndex: 1 }}>
                {/* Header */}
                <div className="text-center mb-5 p-4" style={{
                    background: 'linear-gradient(45deg, rgba(255, 215, 0, 0.1), rgba(138, 43, 226, 0.1))',
                    borderRadius: '20px',
                    border: '2px solid rgba(255, 215, 0, 0.3)',
                    boxShadow: '0 10px 30px rgba(0, 0, 0, 0.5)'
                }}>
                    <h1 className="display-3 gradient-text mb-3 fw-bold">
                        ✨Lorcana Palermo <br />Proxy Printer✨
                    </h1>
                    <h2 className="h3 text-warning mb-3">Proxy Card Printer</h2>
                    <p className="lead" style={{ color: '#b8b8ff' }}>
                        Create and print your own custom proxy cards
                    </p>
                </div>

                {/* Search Section */}
                <div className="mb-4 p-4" style={{
                    background: 'rgba(255, 255, 255, 0.1)',
                    backdropFilter: 'blur(10px)',
                    borderRadius: '15px',
                    border: '1px solid rgba(255, 255, 255, 0.2)',
                    boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)'
                }}>
                    {/* Ricerca Carte */}
                    <div className="mb-4">
                        <h5 className="text-warning mb-3">🔍 Search Disney Lorcana Cards</h5>
                        <div className="row mb-3">
                            <div className="col-md-8 mb-2 mb-md-0">
                                <input
                                    type="text"
                                    className="form-control form-control-lg"
                                    placeholder="Search cards by name (e.g. 'Mickey Mouse', 'Elsa')..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    onKeyPress={(e) => e.key === 'Enter' && searchCards()}
                                    style={{
                                        background: 'rgba(255, 255, 255, 0.9)',
                                        border: 'none',
                                        borderRadius: '10px'
                                    }}
                                />
                            </div>
                            <div className="col-md-4">
                                <button
                                    className="btn btn-lg w-100"
                                    onClick={searchCards}
                                    disabled={!searchQuery.trim() || isSearching}
                                    style={{
                                        background: 'linear-gradient(45deg, #4ecdc4, #44a08d)',
                                        border: 'none',
                                        borderRadius: '10px',
                                        color: 'white',
                                        fontWeight: 'bold'
                                    }}
                                >
                                    {isSearching ? '🔄 Searching...' : '🔍 Search'}
                                </button>
                            </div>
                        </div>
                        <div className="row mb-3">
                            <div className="col-12 d-flex justify-content-center">
                                <button
                                    className="btn btn-primary btn-lg mt-2"
                                    onClick={importFromClipboard}
                                    style={{
                                        background: 'linear-gradient(45deg, #007bff, #00c6ff)',
                                        border: 'none',
                                        borderRadius: '10px',
                                        color: 'white',
                                        fontWeight: 'bold',
                                        minWidth: '200px'
                                    }}
                                >
                                    📋 Import from Clipboard
                                </button>
                            </div>
                        </div>

                        {/* Risultati Ricerca */}
                        {showResults && (
                            <div className="mt-4 p-3" style={{
                                background: 'rgba(0, 0, 0, 0.3)',
                                borderRadius: '10px',
                                maxHeight: '400px',
                                overflowY: 'auto'
                            }}>
                                <div className="d-flex justify-content-between align-items-center mb-3">
                                    <h6 className="text-info mb-0">
                                        Results found: {searchResults.length}
                                    </h6>
                                    <button
                                        className="btn btn-sm btn-outline-light"
                                        onClick={() => setShowResults(false)}
                                    >
                                        ✕ Close
                                    </button>
                                </div>

                                {searchResults.length > 0 ? (
                                    <div className="row">
                                        {searchResults.slice(0, 12).map((card, index) => (
                                            <div key={index} className="col-6 col-md-3 col-lg-2 mb-3 d-flex justify-content-center">
                                                <div
                                                    className="card bg-dark border-secondary"
                                                    style={{
                                                        aspectRatio: '2.5/3.5',
                                                        width: '100%',
                                                        maxWidth: '260px',
                                                        border: '2px solid #444',
                                                        borderRadius: '10px',
                                                        position: 'relative',
                                                        background: '#1a1a2e',
                                                        overflow: 'hidden',
                                                        display: 'flex',
                                                        alignItems: 'stretch',
                                                        justifyContent: 'center',
                                                        margin: '0 auto',
                                                        boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
                                                        cursor: 'pointer',
                                                        transition: 'all 0.3s ease'
                                                    }}
                                                    onClick={() => addCardFromSearch(card)}
                                                    onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.05)'}
                                                    onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
                                                >
                                                    <img
                                                        src={card.image_uris.digital.normal}
                                                        className="card-img-top"
                                                        alt={card.name}
                                                        style={{
                                                            width: '100%',
                                                            height: '100%',
                                                            objectFit: 'cover',
                                                            borderRadius: '10px',
                                                            display: 'block',
                                                            background: '#1a1a2e'
                                                        }}
                                                        onError={e => {
                                                            e.target.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjEyMCIgeG1zbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjNGY0ZjRmIi8+PHRleHQgeD0iNTAlIiB5PSI1MCUiIGZvbnQtZmFtaWx5PSJBcmlhbCwgc2Fucy1zZXJpZiIgZm9udC1zaXplPSIxMiIgZmlsbD0iIzk5OSIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZHk9Ii4zZW0iPkxvcmNhbmE8L3RleHQ+PC9zdmc+';
                                                        }}
                                                    />
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="text-center text-muted py-4">
                                        <div style={{ fontSize: '48px', marginBottom: '15px' }}>🃏</div>
                                        <p>No cards found for "{searchQuery}"</p>
                                        <small>Try different terms like "Mickey", "Elsa", "Beast"...</small>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    <div className="text-center position-relative my-4">
                        <hr style={{ borderColor: 'rgba(255, 255, 255, 0.3)' }} />
                        <span className="position-absolute top-50 start-50 translate-middle px-3"
                            style={{
                                background: 'rgba(255, 255, 255, 0.1)',
                                borderRadius: '20px',
                                color: '#b8b8ff'
                            }}>
                            or
                        </span>
                    </div>

                </div>

                {/* Card Counter & Pagination */}
                <div className="text-center mb-4">
                    <h4 className="text-warning">
                        Cards added: <span className="badge bg-warning text-dark">{cards.length}</span>
                    </h4>
                    {cards.length > 9 && (
                        <div className="d-flex justify-content-center align-items-center gap-2 mt-2">
                            <button className="btn btn-sm btn-secondary" onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1}>&lt; Prev</button>
                            <span style={{ minWidth: 80 }}>
                                Page {currentPage} of {Math.ceil(cards.length / 9)}
                            </span>
                            <button className="btn btn-sm btn-secondary" onClick={() => setCurrentPage(p => Math.min(Math.ceil(cards.length / 9), p + 1))} disabled={currentPage === Math.ceil(cards.length / 9)}>Next &gt;</button>
                        </div>
                    )}
                </div>

                {/* Cards Grid */}
                <div className="mb-4 p-4" style={{
                    background: 'rgba(255, 255, 255, 0.05)',
                    borderRadius: '15px',
                    border: '2px dashed rgba(255, 215, 0, 0.3)',
                    minHeight: '400px'
                }}>
                    <div className="row">
                        {renderCardSlots()}
                    </div>
                </div>

                {/* Action Buttons */}
                <div className="text-center mb-5">
                    <div className="d-flex flex-column flex-md-row gap-3 justify-content-center">
                        <button
                            className="btn btn-lg px-4"
                            onClick={generatePDF}
                            disabled={cards.length === 0 || isGeneratingPDF}
                            style={{
                                background: 'linear-gradient(45deg, #4CAF50, #45a049)',
                                border: 'none',
                                borderRadius: '10px',
                                color: 'white',
                                fontWeight: 'bold',
                                minWidth: '160px'
                            }}
                        >
                            {isGeneratingPDF ? '⏳ Generating PDF...' : '🖨️ Print Cards'}
                        </button>
                        <button
                            className="btn btn-lg px-4"
                            onClick={clearAllCards}
                            disabled={cards.length === 0 || isGeneratingPDF}
                            style={{
                                background: 'linear-gradient(45deg, #ff4757, #ff6b6b)',
                                border: 'none',
                                borderRadius: '10px',
                                color: 'white',
                                fontWeight: 'bold',
                                minWidth: '160px'
                            }}
                        >
                            🗑️ Clear All
                        </button>
                    </div>
                </div>

                {/* Instructions */}
                <div className="p-4" style={{
                    background: 'rgba(255, 215, 0, 0.1)',
                    border: '1px solid rgba(255, 215, 0, 0.3)',
                    borderRadius: '15px'
                }}>
                    <h3 className="text-warning mb-3">📋 Instructions</h3>
                    <div className="row">
                        <div className="col-md-6">
                            <ul className="list-unstyled">
                                <li className="mb-2">✨ Search official cards from the Lorcana database</li>
                                <li className="mb-2">✨ Add up to 9 cards using the search</li>
                                <li className="mb-2">✨ Cards will be arranged in a 3x3 grid</li>
                            </ul>
                        </div>
                        <div className="col-md-6">
                            <ul className="list-unstyled">
                                <li className="mb-2">✨ Click "Print Cards" to create a printable file or generate a PDF</li>
                                <li className="mb-2">✨ Optimized size for printing on A4</li>
                                <li className="mb-2">✨ Remove individual cards with the × button</li>
                            </ul>
                        </div>
                    </div>
                </div>
            </div>

            <ToastContainer
                position="top-right"
                autoClose={3000}
                hideProgressBar={false}
                newestOnTop={true}
                closeOnClick
                rtl={false}
                pauseOnFocusLoss
                draggable
                pauseOnHover
                theme="dark"
                style={{
                    zIndex: 9999,
                    fontSize: '14px'
                }}
            />
            {/* Loading overlay for PDF generation */}
            {isGeneratingPDF && (
                <div style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    width: '100vw',
                    height: '100vh',
                    background: 'rgba(0,0,0,0.7)',
                    zIndex: 99999,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexDirection: 'column',
                }}>
                    <div className="spinner-border text-warning" style={{ width: 80, height: 80, marginBottom: 24 }} role="status">
                        <span className="visually-hidden">Loading...</span>
                    </div>
                    <div style={{ color: 'white', fontSize: 24, fontWeight: 'bold' }}>Generating PDF, please wait...</div>
                </div>
            )}
        </div>
    );
};