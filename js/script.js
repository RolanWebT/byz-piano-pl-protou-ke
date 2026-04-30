// Ensure AudioContext is created after a user gesture (e.g., click)
let audioCtx;
let oscillators = {}; // To keep track of active oscillators

document.addEventListener("DOMContentLoaded", () => {
    const pianoKeysContainer = document.getElementById("piano-keys");
    const currentFrequencySpan = document.getElementById("current-frequency");
    const tuningOptionsContainer = document.querySelector(".tuning-options");
    const instrumentSelect = document.getElementById('instrumentSelect'); // Target the new select element

    // Define notes with their Western and new Greek names, and offsets from A4
    const notes = [
        { byzName: "Ni", greekName: "Νη", a4Offset: -9, isBlack: false },
        { byzName: "Ni#", greekName: "Νη+", a4Offset: -8, isBlack: true },
        { byzName: "Pa", greekName: "Πα", a4Offset: -7, isBlack: false },
        { byzName: "Pa#", greekName: "Βου-", a4Offset: -6, isBlack: true },
        { byzName: "Bou", greekName: "Βου", a4Offset: -5, isBlack: false },
        { byzName: "Ga", greekName: "Γα", a4Offset: -4, isBlack: false },
        { byzName: "Ga#", greekName: "Γα+", a4Offset: -3, isBlack: true },
        { byzName: "Di", greekName: "Δι", a4Offset: -2, isBlack: false },
        { byzName: "Di#", greekName: "Κε-", a4Offset: -1, isBlack: true },
        { byzName: "Ke", greekName: "Κε", a4Offset: 0, isBlack: false }, // A4
        { byzName: "Ke#", greekName: "Ζω-", a4Offset: 1, isBlack: true },
        { byzName: "Zw", greekName: "Ζω", a4Offset: 2, isBlack: false },
    ];

    // --- Global Variables for Tuning and Instrument ---
    let baseA4Frequency; // Will be set by tuning selection
    let currentInstrumentType = instrumentSelect.value; // Get initial value from select

    // Function to get the Greek name for a given Western note name, applying primes based on octave.
    const getGreekNoteName = (byzName, octave) => {
        const noteInfo = notes.find((n) => n.byzName === byzName);
        if (!noteInfo) return byzName;

        let greekName = noteInfo.greekName;
        let primeSuffix = "";

        if (octave === 3) {
            primeSuffix = "";
        } else if (octave === 4) {
            if (byzName === "Zw" || byzName === "Ke#") {
                primeSuffix = "᾽";
            } else {
                primeSuffix = "";
            }
        } else if (octave >= 5) {
            primeSuffix = "᾽";
        }

        return greekName + primeSuffix;
    };

    // Manual tuning map for notes Bou-, Bou, Ga+ and Zw in Diatonik Mode 
    const manualTuningMap = {
        "261.63": { // Low
            "Pa#4": 190.00,
            "Bou4": 192.44,
            "Ga#4": 215.88,
            "Zw4": 287.60
        },
        "293.66": { // Medium-low
            "Pa#4": 213.00,
            "Bou4": 216.00,
            "Ga#4": 242.32,
            "Zw4": 323.30
        },
        "329.63": { // Medium
            "Pa#4": 238.00,
            "Bou4": 242.45,
            "Ga#4": 271.99,
            "Zw4": 363.25
        },
        "349.23": { // High
            "Pa#4": 251.00,
            "Bou4": 256.87,
            "Ga#4": 288.61,
            "Zw4": 384.87
        }
    };

    // Function to generate piano keys based on the desired range
    const generatePianoKeys = (
        startNoteName,
        startOctave,
        endNoteName,
        endOctave
    ) => {
        pianoKeysContainer.innerHTML = ""; // Clear existing keys

        let startIndex = notes.findIndex(
            (note) => note.byzName === startNoteName
        );
        if (startIndex === -1) {
            console.error(`Starting note "${startNoteName}" not found.`);
            return;
        }

        let endIndex = notes.findIndex((note) => note.byzName === endNoteName);
        if (endIndex === -1) {
            console.error(`Ending note "${endNoteName}" not found.`);
            return;
        }

        const totalNotesCount =
            (endOctave - startOctave) * 12 + (endIndex - startIndex) + 1;

        let currentNoteInNotesArray = startIndex;
        let currentOctave = startOctave;

        for (let i = 0; i < totalNotesCount; i++) {
            const note = notes[currentNoteInNotesArray % 12];

            const byzNameWithOctave = `${note.byzName}${currentOctave}`;

            let frequency;
            // Check the currently active set of overrides
            if (activeManualNotes[byzNameWithOctave]) {
                frequency = activeManualNotes[byzNameWithOctave];
            } else {
                const noteIndexFromA4 = (currentOctave - 4) * 12 + note.a4Offset;
                frequency = baseA4Frequency * Math.pow(2, noteIndexFromA4 / 12);
            }

            const displayNoteName = getGreekNoteName(note.byzName, currentOctave);

            const keyElement = document.createElement("div");
            keyElement.classList.add("key", note.isBlack ? "black-key" : "white-key");
            keyElement.dataset.frequency = frequency.toFixed(2);
            keyElement.dataset.note = byzNameWithOctave;
            keyElement.textContent = displayNoteName;

            // Mouse events for desktop
            keyElement.addEventListener("mousedown", (event) => {
                event.preventDefault(); // Prevent default browser behavior (like text selection)
                playNote(keyElement, parseFloat(keyElement.dataset.frequency));
            });
            keyElement.addEventListener("mouseup", () => stopNote(keyElement));
            keyElement.addEventListener("mouseleave", () => stopNote(keyElement));

            // Touch events for mobile
            keyElement.addEventListener(
                "touchstart",
                (event) => {
                    event.preventDefault(); // Prevent scrolling, zooming, etc. to allow piano interaction
                    playNote(keyElement, parseFloat(keyElement.dataset.frequency));
                },
                { passive: false }
            ); // Use passive: false to allow preventDefault()

            keyElement.addEventListener("touchend", () => stopNote(keyElement));
            keyElement.addEventListener("touchcancel", () => stopNote(keyElement)); // Handle interrupted touches

            pianoKeysContainer.appendChild(keyElement);

            currentNoteInNotesArray++;
            if (currentNoteInNotesArray % 12 === 0 && i < totalNotesCount - 1) {
                currentOctave++;
            }
        }
    };

    let activeManualNotes = {}; // Global variable to store current overrides

    // --- Tuning Logic ---
    function setBaseTuning(selectedOptionValue) {
        baseA4Frequency = parseFloat(selectedOptionValue);
        currentFrequencySpan.textContent = baseA4Frequency.toFixed(3);

        // Update the active overrides based on the selected tuning key
        // We use the string value (e.g., "329.63") to find the right object
        activeManualNotes = manualTuningMap[selectedOptionValue] || {};
        stopAllNotes();

        // Changed range: F4 (Γα) to E5 (Βου)
        generatePianoKeys("Pa", 4, "Bou", 5);

    }

    // --- Audio Context and Playback Functions ---
    document.body.addEventListener("mousedown", initializeAudioContext, {
        once: true,
    });
    document.body.addEventListener("keydown", initializeAudioContext, {
        once: true,
    });
    document.body.addEventListener("touchstart", initializeAudioContext, {
        once: true,
    });

    function initializeAudioContext() {
        if (!audioCtx) {
            audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            console.log("AudioContext initialized");
            audioCtx.resume().then(() => {
                console.log("AudioContext resumed successfully");
            });
        }
    }

    function playNote(keyElement, frequency) {
        if (!audioCtx) {
            console.warn(
                "AudioContext not initialized yet. Click on the page first."
            );
            return;
        }

        const note = keyElement.dataset.note;
        if (!oscillators[note]) {
            keyElement.classList.add("active");

            const oscillator = audioCtx.createOscillator();
            const gainNode = audioCtx.createGain();

            // Set initial gain to 0 to implement attack
            gainNode.gain.setValueAtTime(0, audioCtx.currentTime);

            // --- Instrument specific sound generation ---
            switch (currentInstrumentType) {
                case 'flute': // Flute sound
                    oscillator.type = 'triangle';
                    gainNode.gain.linearRampToValueAtTime(0.5, audioCtx.currentTime + 0.05); // Quick attack: 50 milliseconds
                    break;

                case 'trumpet': // Trumpet sound
                    oscillator.type = 'sawtooth';
                    gainNode.gain.linearRampToValueAtTime(0.5, audioCtx.currentTime + 0.1); // Slower attack: 100 milliseconds
                    break;

                default: // Fallback to flute
                    oscillator.type = 'triangle';
                    gainNode.gain.linearRampToValueAtTime(0.5, audioCtx.currentTime + 0.05);
                    break;
            }

            oscillator.frequency.setValueAtTime(frequency, audioCtx.currentTime);
            oscillator.connect(gainNode);
            gainNode.connect(audioCtx.destination);

            oscillator.start(audioCtx.currentTime); // Start playing immediately
            oscillators[note] = { oscillator, gainNode };
        }
    }


    function stopNote(keyElement) {
        const note = keyElement.dataset.note;
        if (oscillators[note]) {
            keyElement.classList.remove('active');
            const { oscillator, gainNode } = oscillators[note];

            gainNode.gain.cancelScheduledValues(audioCtx.currentTime);

            let releaseTime = 0.3; // Default release time (good for flute)

            if (currentInstrumentType === 'trumpet') {
                releaseTime = 0.8; // Longer decay for a sustained brass note
            }

            // Exponential ramp to near silence over the defined release time
            gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + releaseTime);
            // Stop the oscillator after the release phase
            oscillator.stop(audioCtx.currentTime + releaseTime);

            oscillator.onended = () => {
                oscillator.disconnect();
                gainNode.disconnect();
                delete oscillators[note];
            };
        }
    }

    function stopAllNotes() {
        if (audioCtx) {
            Object.values(oscillators).forEach(({ oscillator, gainNode }) => {
                gainNode.gain.cancelScheduledValues(audioCtx.currentTime);
                gainNode.gain.exponentialRampToValueAtTime(
                    0.001,
                    audioCtx.currentTime + 0.05
                );
                oscillator.stop(audioCtx.currentTime + 0.05);
            });
            oscillators = {};
            document
                .querySelectorAll(".key.active")
                .forEach((key) => key.classList.remove("active"));
        }
    }

    // --- Event Listeners and Initial Setup ---

    // Initial tuning setup (sets baseA4Frequency and generates keys)
    const initialCheckedTuningValue = document.querySelector('input[name="tuning"]:checked').value;
    setBaseTuning(initialCheckedTuningValue);

    // Event listener for tuning options
    tuningOptionsContainer.addEventListener('change', (event) => {
        setBaseTuning(event.target.value);
    });

    // Event listener for instrument selection (new select element)
    instrumentSelect.addEventListener('change', (event) => {
        currentInstrumentType = event.target.value;
        stopAllNotes(); // Stop any currently playing notes when instrument changes
    });


    // Keyboard support for playing notes
    // Map keyboard keys to note names
    // Note: The mapping is based on a standard Western piano layout, adjust as needed for your specific requirements.
    // The mapping is designed to match the keys of a piano, where each key corresponds to a specific note.
    // The keys 'a', 's', 'd', etc. correspond to notes Ga, Di, Ke, etc.
    const keyboardMap = {
        a: "Pa4",
        w: "Pa#4",
        s: "Bou4",
        d: "Ga4",
        r: "Ga#4",
        f: "Di4",
        g: "Ke4",
        y: "Ke#4",
        h: "Zw4",
        j: "Ni5",
        i: "Ni#5",
        k: "Pa5",
        o: "Pa#5",
        l: "Bou5",
    };

    document.addEventListener("keydown", (event) => {
        const noteName = keyboardMap[event.key.toLowerCase()];
        if (noteName && !event.repeat) {
            const keyElement = document.querySelector(
                `.key[data-note="${noteName}"]`
            );
            if (keyElement && !keyElement.classList.contains("active")) {
                playNote(keyElement, parseFloat(keyElement.dataset.frequency));
            }
        }
    });

    document.addEventListener("keyup", (event) => {
        const noteName = keyboardMap[event.key.toLowerCase()];
        if (noteName) {
            const keyElement = document.querySelector(
                `.key[data-note="${noteName}"]`
            );
            if (keyElement) {
                stopNote(keyElement);
            }
        }
    });
});
