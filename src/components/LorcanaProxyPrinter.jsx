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
    const fileInputRef = useRef(null);

    const corsProxyUrl = (url) => {
        return `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`;
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
                // L'API restituisce i risultati all'interno dell'oggetto 'results'
                setSearchResults(data.results || []);
                setShowResults(true);
            } else {
                console.error('Errore nella ricerca:', response.status);
                setSearchResults([]);
            }
        } catch (error) {
            console.error('Errore nella ricerca:', error);
            setSearchResults([]);
        } finally {
            setIsSearching(false);
        }
    };

    const addCardFromSearch = (cardData) => {
        if (cards.length < 9) {
            const newCard = {
                id: Date.now(),
                src: cardData.image_uris.digital.normal, // Salva l'URL originale, non proxato
                type: 'search',
                name: cardData.name,
                set: cardData.set.name
            };
            setCards([...cards, newCard]);
            setSearchQuery('');
            toast.success(`${cardData.name} aggiunta alla lista`);
        } else {
            toast.error('Hai raggiunto il limite massimo di 9 carte');
        }
    };

    const addCardFromUrl = async () => {
        if (!cardUrl.trim()) {
            toast.error('Inserisci un URL valido');
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
            toast.success('Carta aggiunta con successo!');
        } catch (error) {
            toast.error('Errore nel caricamento dell\'immagine');
        }
    };

    const handleFileUpload = (event) => {
        const files = Array.from(event.target.files);
        const remainingSlots = 9 - cards.length;
        const filesToProcess = files.slice(0, remainingSlots);

        filesToProcess.forEach(file => {
            const reader = new FileReader();
            reader.onload = (e) => {
                const newCard = {
                    id: Date.now() + Math.random(),
                    src: e.target.result,
                    type: 'file',
                    name: file.name
                };
                setCards(prev => [...prev, newCard]);
                toast.success('Carta caricata con successo!');
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
        toast.info('Carta rimossa');
    };

    const clearAllCards = () => {
        setCards([]);
        setCardUrl('');
        setSearchQuery('');
        setSearchResults([]);
        setShowResults(false);
    };

    const generatePDF = async () => {
        if (cards.length === 0) {
            alert('Aggiungi almeno una carta prima di generare il PDF!');
            return;
        }

        try {
            // Canvas temporaneo per l'intera pagina A4 a 150 DPI
            const DPI = 150;
            const canvas = document.createElement('canvas');
            canvas.width = Math.round(210 / 25.4 * DPI); // 210mm
            canvas.height = Math.round(297 / 25.4 * DPI); // 297mm
            const ctx = canvas.getContext('2d');

            // Sfondo bianco
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            // Calcola le dimensioni delle carte e gli spazi
            const cardWidth = Math.floor(canvas.width / 3) - 12;  // margine minore
            const cardHeight = Math.floor(canvas.height / 3) - 12;
            const marginX = 6;
            const marginY = 6;
            const spacing = 6;

            // Funzione per caricare un'immagine (usa proxy solo se serve)
            const loadImage = (src) => {
                return new Promise((resolve, reject) => {
                    const img = new window.Image();
                    img.crossOrigin = 'anonymous';
                    img.onload = () => resolve(img);
                    img.onerror = () => reject(new Error('Immagine non caricata'));
                    if (src.startsWith('data:') || src.startsWith('blob:')) {
                        img.src = src;
                    } else {
                        img.src = corsProxyUrl(src);
                    }
                });
            };

            // Carica e disegna ogni carta
            for (let i = 0; i < cards.length && i < 9; i++) {
                const row = Math.floor(i / 3);
                const col = i % 3;
                const x = marginX + col * (cardWidth + spacing);
                const y = marginY + row * (cardHeight + spacing);

                try {
                    const img = await loadImage(cards[i].src);
                    // Calcola le dimensioni mantenendo l'aspect ratio
                    let drawWidth = cardWidth;
                    let drawHeight = cardHeight;
                    const imgRatio = img.width / img.height;
                    const cardRatio = cardWidth / cardHeight;
                    if (imgRatio > cardRatio) {
                        drawHeight = drawWidth / imgRatio;
                    } else {
                        drawWidth = drawHeight * imgRatio;
                    }
                    // Centra l'immagine nello spazio della carta
                    const xOffset = x + (cardWidth - drawWidth) / 2;
                    const yOffset = y + (cardHeight - drawHeight) / 2;
                    ctx.drawImage(img, xOffset, yOffset, drawWidth, drawHeight);
                    // Disegna un bordo
                    ctx.strokeStyle = '#000000';
                    ctx.lineWidth = 2;
                    ctx.strokeRect(x, y, cardWidth, cardHeight);
                } catch (error) {
                    // Se l'immagine non si carica, disegna un rettangolo grigio
                    ctx.fillStyle = '#cccccc';
                    ctx.fillRect(x, y, cardWidth, cardHeight);
                    ctx.strokeStyle = '#000000';
                    ctx.lineWidth = 2;
                    ctx.strokeRect(x, y, cardWidth, cardHeight);
                    ctx.fillStyle = '#333';
                    ctx.font = 'bold 16px Arial';
                    ctx.fillText('Immagine non trovata', x + 10, y + cardHeight / 2);
                }
            }

            // Converti il canvas in PDF
            const imgData = canvas.toDataURL('image/jpeg', 0.92);
            const pdf = new jsPDF({
                orientation: 'portrait',
                unit: 'mm',
                format: 'a4'
            });
            pdf.addImage(imgData, 'JPEG', 0, 0, 210, 297);
            pdf.autoPrint();
            window.open(pdf.output('bloburl'), '_blank');
        } catch (error) {
            console.error('Errore nella generazione del PDF:', error);
            alert('Errore nella generazione del PDF. Assicurati che le immagini siano accessibili.');
        }
    };

    const renderCardSlots = () => {
        const slots = [];
        for (let i = 0; i < 9; i++) {
            const card = cards[i];
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
                                    alt={`Carta ${i + 1}`}
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
                                <small>Slot {i + 1}</small>
                            </div>
                        )}
                    </div>
                </div>
            );
        }
        return slots;
    };

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
                        Crea e stampa le tue carte proxy personalizzate
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
                        <h5 className="text-warning mb-3">🔍 Cerca Carte Disney Lorcana</h5>
                        <div className="row mb-3">
                            <div className="col-md-8 mb-2 mb-md-0">
                                <input
                                    type="text"
                                    className="form-control form-control-lg"
                                    placeholder="Cerca carte per nome (es. 'Mickey Mouse', 'Elsa')..."
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
                                    {isSearching ? '🔄 Ricerca...' : '🔍 Cerca'}
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
                                        Risultati trovati: {searchResults.length}
                                    </h6>
                                    <button
                                        className="btn btn-sm btn-outline-light"
                                        onClick={() => setShowResults(false)}
                                    >
                                        ✕ Chiudi
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
                                        <p>Nessuna carta trovata per "{searchQuery}"</p>
                                        <small>Prova con termini diversi come "Mickey", "Elsa", "Beast"...</small>
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
                            oppure
                        </span>
                    </div>

                </div>

                {/* Card Counter */}
                <div className="text-center mb-4">
                    <h4 className="text-warning">
                        Carte aggiunte: <span className="badge bg-warning text-dark">{cards.length}</span>/9
                    </h4>
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
                            disabled={cards.length === 0}
                            style={{
                                background: 'linear-gradient(45deg, #4CAF50, #45a049)',
                                border: 'none',
                                borderRadius: '10px',
                                color: 'white',
                                fontWeight: 'bold',
                                minWidth: '160px'
                            }}
                        >
                            🖨️ Stampa Carte
                        </button>
                        <button
                            className="btn btn-lg px-4"
                            onClick={clearAllCards}
                            disabled={cards.length === 0}
                            style={{
                                background: 'linear-gradient(45deg, #ff4757, #ff6b6b)',
                                border: 'none',
                                borderRadius: '10px',
                                color: 'white',
                                fontWeight: 'bold',
                                minWidth: '160px'
                            }}
                        >
                            🗑️ Cancella Tutto
                        </button>
                    </div>
                </div>

                {/* Instructions */}
                <div className="p-4" style={{
                    background: 'rgba(255, 215, 0, 0.1)',
                    border: '1px solid rgba(255, 215, 0, 0.3)',
                    borderRadius: '15px'
                }}>
                    <h3 className="text-warning mb-3">📋 Istruzioni d'uso</h3>
                    <div className="row">
                        <div className="col-md-6">
                            <ul className="list-unstyled">
                                <li className="mb-2">✨ Cerca carte ufficiali dal database Lorcana</li>
                                <li className="mb-2">✨ Aggiungi fino a 9 carte usando ricerca</li>
                                <li className="mb-2">✨ Le carte saranno disposte in una griglia 3x3</li>
                            </ul>
                        </div>
                        <div className="col-md-6">
                            <ul className="list-unstyled">
                                <li className="mb-2">✨ Clicca su "Stampa Carte" per creare il file stampabile o generare un PDF</li>
                                <li className="mb-2">✨ Dimensioni ottimizzate per stampa su A4</li>
                                <li className="mb-2">✨ Rimuovi singole carte con il pulsante ×</li>
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
        </div>
    );
}
