import fs from "node:fs";
import vm from "node:vm";

const sourcePath = "/Users/maksymilianjaneczek/.codex/attachments/6346603b-a097-4268-a94a-f2134c6cbcc4/pasted-text.txt";
const outPath = new URL("../data/app-data.json", import.meta.url);

const html = fs.readFileSync(sourcePath, "utf8");

function extractConst(name) {
  const start = html.indexOf(`const ${name} = `);
  if (start === -1) throw new Error(`Missing ${name}`);
  const valueStart = html.indexOf("=", start) + 1;
  const end = html.indexOf("];", valueStart);
  if (end === -1) throw new Error(`Could not find end of ${name}`);
  return `${html.slice(valueStart, end + 1)}`;
}

function evaluateArray(name) {
  const sandbox = {};
  vm.createContext(sandbox);
  return vm.runInContext(`(${extractConst(name)})`, sandbox, { timeout: 1000 });
}

const rawAllRooms = evaluateArray("rawAllRooms");
const layouts = {
  "sala-dolna": evaluateArray("layoutSalaDolna"),
  "sala-gorna": evaluateArray("layoutSalaGorna"),
  namiot: evaluateArray("layoutNamiot"),
};

function roomLabel(roomId) {
  return {
    "sala-dolna": "Sala dolna",
    "sala-gorna": "Sala gorna",
    namiot: "Namiot",
  }[roomId] || roomId;
}

function seatSide(roomId, tableId, seatNo) {
  const table = layouts[roomId]?.flat().find((item) => item.id === tableId);
  if (!table) return "";
  return seatNo <= table.left ? "L" : "P";
}

const participants = rawAllRooms.map((row, idx) => {
  const [roomId, tableId, seatNo, name, isCompanion, diet] = row;
  const emptySeat = name.trim() === "X" || diet === "x";
  return {
    id: `p${idx + 1}`,
    name: name.trim(),
    email: "",
    phone: "",
    roomId,
    roomName: roomLabel(roomId),
    tableId,
    seatNo,
    side: seatSide(roomId, tableId, seatNo),
    diet,
    isCompanion,
    emptySeat,
    paidDeposit: false,
    paidInstallment1: false,
    paidInstallment2: false,
    paidBall: false,
    paidTransport: false,
    transport: false,
    transportInfo: "",
    registrationStatus: emptySeat ? "empty-seat" : "imported",
    adminNote: emptySeat ? "Miejsce puste z planu stolow." : "Do uzupelnienia przez administratora.",
    updatedAt: new Date().toISOString(),
  };
});

const appData = {
  version: 1,
  generatedAt: new Date().toISOString(),
  settings: {
    appName: "Bal Lekarza",
    eventName: "Bal Lekarza 2026",
    subtitle: "Konto uczestnika, miejsca, platnosci i infopak",
    eventDate: "2026-11-08",
    venueName: "Bialy Dom",
    venueAddress: "ul. Karola Darwina 50, 44-177 Paniowki",
    mapUrl: "https://maps.google.com/?q=Bialy%20Dom%20Karola%20Darwina%2050%20Paniowki",
    organizedTransportInfo: "Autokary: zbiorka 4:10. Status zapisu widoczny na koncie uczestnika.",
    theme: {
      primary: "#0b1b4f",
      gold: "#c7a24a",
      coral: "#e79b83",
      sage: "#8aa68a",
      cream: "#fffaf0",
      ink: "#172036",
    },
  },
  infopack: {
    intro: "Infopak w stylistyce polmetka: elegancki granat, linie ilustracyjne i nowa, jasniejsza paleta z biela, zlotem oraz letnimi akcentami.",
    schedule: [
      { time: "19:00", title: "Rozpoczecie" },
      { time: "19:35", title: "Kieliszek szampana" },
      { time: "19:45", title: "Danie glowne" },
      { time: "22:30", title: "Kolacja I" },
      { time: "00:00", title: "Kolacja II" },
      { time: "04:00", title: "Zakonczenie" },
    ],
    sections: [
      {
        title: "Dress code",
        body: "Black tie lub elegancki strój wieczorowy. Szczegoly mozna edytowac w panelu admina.",
      },
      {
        title: "Diety",
        body: "Diety sa widoczne przy miejscu uczestnika. Administrator moze zmienic je zdalnie w tabeli uczestnikow.",
      },
      {
        title: "Transport",
        body: "Uczestnicy zapisani na transport zobacza informacje o autokarze na swoim koncie.",
      },
    ],
  },
  layouts,
  participants,
  registrations: [],
  posts: [
    {
      id: "post-1",
      author: "Organizatorzy",
      body: "Tu pojawia sie zamknieta tablica rocznika: zdjecia, wpisy i komunikaty widoczne tylko po zalogowaniu.",
      imageData: "",
      createdAt: new Date().toISOString(),
      hidden: false,
    },
  ],
  notifications: [],
  users: [],
};

fs.writeFileSync(outPath, `${JSON.stringify(appData, null, 2)}\n`);
console.log(`Saved ${participants.length} seats to ${outPath.pathname}`);
