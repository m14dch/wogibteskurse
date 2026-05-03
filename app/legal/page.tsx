import type { Metadata } from "next";
import Link from "next/link";

const CONTACT_URL = "https://github.com/mathiasaebersold/wogibteskurse/issues";

export const metadata: Metadata = {
  title: "Datenschutz & Hinweise - Wo gibt es Kurse?",
  description:
    "Datenschutz- und Nutzungshinweise zum unabhängigen Kursfinder für Kinderkurse in Zürich.",
};

export default function LegalPage() {
  return (
    <main className="min-h-dvh bg-gray-50 text-gray-800">
      <div className="mx-auto max-w-3xl px-5 py-8 sm:px-6 sm:py-12">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-500 hover:text-gray-800"
        >
          <span aria-hidden="true">←</span>
          Zur Karte
        </Link>

        <article className="mt-6 rounded-lg border border-gray-200 bg-white px-5 py-6 shadow-sm sm:px-8 sm:py-8">
          <header className="border-b border-gray-100 pb-5">
            <p className="text-sm font-medium" style={{ color: "var(--brand-teal)" }}>
              Stand: April 2026
            </p>
            <h1 className="mt-2 text-2xl font-bold text-gray-950 sm:text-3xl">
              Datenschutz & Hinweise
            </h1>
          </header>

          <div className="space-y-7 pt-6 text-sm leading-6 sm:text-base sm:leading-7">
            <section>
              <h2 className="text-lg font-semibold text-gray-950">Verantwortlich</h2>
              <p className="mt-2">Dieses Angebot ist ein unabhängiges Community-Projekt.</p>
              <p className="mt-2">
                Kontakt und Rückmeldungen:{" "}
                <a
                  href={CONTACT_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-blue-700 underline decoration-blue-200 underline-offset-2 hover:text-blue-900"
                >
                  GitHub Issues
                </a>
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-gray-950">Unabhängiges Projekt</h2>
              <p className="mt-2">
                "Wo gibt es Kurse?" ist nicht von der Stadt Zürich erstellt, betrieben oder
                beauftragt. Das Projekt ist nicht mit der Stadt Zürich oder ihren Dienstabteilungen
                verbunden und wird von diesen nicht unterstützt oder überprüft.
              </p>
              <p className="mt-2">
                Die Anwendung soll die öffentlich zugänglichen Kursangebote der Stadt Zürich
                leichter auffindbar machen. Verbindlich sind immer die Angaben im offiziellen
                Sport-Portal der Stadt Zürich.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-gray-950">Kursdaten</h2>
              <p className="mt-2">
                Die Kursdaten werden aus dem öffentlichen Sport-Portal der Stadt Zürich abgerufen.
                Dazu gehören zum Beispiel Kurstitel, Zeiten, Altersangaben, Kursorte, Verfügbarkeit
                und Links zum offiziellen Angebot.
              </p>
              <p className="mt-2">
                Die Daten werden nicht dauerhaft als vollständiger Kurskatalog in diesem Projekt
                veröffentlicht. Einzelne Antworten können serverseitig kurz zwischengespeichert
                werden, damit die Anwendung schneller reagiert und die Datenquelle nicht unnötig
                belastet wird.
              </p>
              <p className="mt-2">
                Bitte prüfe Details wie freie Plätze, Preise, Termine, Teilnahmebedingungen und
                Buchbarkeit immer im offiziellen Portal, bevor du eine Entscheidung triffst oder
                eine Anmeldung vornimmst.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-gray-950">
                Karten, Geocoding und Drittanbieter
              </h2>
              <p className="mt-2">
                Für die Kartendarstellung werden Kartendienste von swisstopo bzw. geo.admin.ch
                verwendet. Beim Laden der Karte können technische Informationen wie IP-Adresse,
                Browserdaten, Zeitpunkt und angefragte Kartenausschnitte an diese Dienste
                übermittelt werden.
              </p>
              <p className="mt-2">
                Da das Sport-Portal nicht für alle Kursorte Koordinaten liefert, werden Kursorte
                serverseitig geocodiert. Dafür wird primär geo.admin.ch verwendet. Falls dort kein
                passendes Ergebnis gefunden wird, kann als Fallback Nominatim von OpenStreetMap
                verwendet werden.
              </p>
              <p className="mt-2">
                Die Anwendung verlinkt ausserdem auf das offizielle Angebot der Stadt Zürich und auf
                den Quellcode bei GitHub. Beim Öffnen externer Links gelten die
                Datenschutzbestimmungen der jeweiligen Anbieter.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-gray-950">Lokale Speicherung im Browser</h2>
              <p className="mt-2">
                Die Anwendung speichert im Browser, ob der Einstieg über den Assistenten bereits
                angezeigt wurde. Dafür wird <code className="font-mono">localStorage</code>{" "}
                verwendet.
              </p>
              <p className="mt-2">
                Diese Information bleibt auf deinem Gerät gespeichert, bis du sie im Browser
                löschst. Sie wird nicht verwendet, um dich über andere Websites hinweg zu verfolgen.
              </p>
              <p className="mt-2">
                Filter und Kartenausschnitt können in der URL stehen, damit Ansichten geteilt oder
                später erneut geöffnet werden können. Wenn du eine solche URL weitergibst, gibst du
                auch die darin enthaltenen Filtereinstellungen weiter.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-gray-950">Server-Logs und Hosting</h2>
              <p className="mt-2">
                Die Anwendung wird auf Fly.io betrieben. Beim Aufruf der Website und der API können
                technische Zugriffsdaten verarbeitet werden, zum Beispiel IP-Adresse, Zeitpunkt,
                aufgerufene URL, HTTP-Status, Browserinformationen und technische Fehlermeldungen.
              </p>
              <p className="mt-2">
                Diese Daten werden verwendet, um die Anwendung bereitzustellen, Fehler zu
                analysieren, Missbrauch zu begrenzen und den Betrieb zu sichern.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-gray-950">Keine Anmeldung</h2>
              <p className="mt-2">
                Für diese Anwendung ist keine Registrierung und kein eigenes Benutzerkonto
                erforderlich. Buchungen oder Anmeldungen erfolgen nicht in dieser Anwendung, sondern
                im offiziellen Sport-Portal der Stadt Zürich.
              </p>
            </section>

            <section>
              <h2 className="text-lg font-semibold text-gray-950">Fehler und Korrekturen</h2>
              <p className="mt-2">
                Wenn dir falsche Kursorte, unklare Angaben oder technische Probleme auffallen, melde
                sie bitte über{" "}
                <a
                  href={CONTACT_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-blue-700 underline decoration-blue-200 underline-offset-2 hover:text-blue-900"
                >
                  GitHub
                </a>
                .
              </p>
            </section>
          </div>
        </article>
      </div>
    </main>
  );
}
