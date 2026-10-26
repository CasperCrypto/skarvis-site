// UI strings used by the scripts. Page copy lives in the HTML files;
// only text that JavaScript writes at runtime belongs here.

export const STRINGS = {
  pl: {
    hero: {
      outZone: 'POZA STREFĄ',
      inZone: 'W STREFIE',
      bearing: 'NAMIAR'
    },
    node: {
      spin: 'Obrót',
      pause: 'Pauza',
      openCover: 'Otwórz pokrywę',
      closeCover: 'Zamknij pokrywę',
      coverOpen: 'POKRYWA OTWARTA',
      titleDf: 'HERMES ID + DF · części',
      titleId: 'HERMES ID · części',
      parts: {
        enclosure: 'Obudowa IP66/IP67',
        pi: 'Raspberry Pi 5',
        esp: 'ESP32-C5 ×2',
        cc: 'Odbiornik CC2652P',
        idant: 'Anteny ID',
        kraken: 'KrakenSDR',
        array: 'Macierz namiarowa',
        clamps: 'Obejmy masztowe'
      }
    },
    form: {
      errName: 'Podaj imię i nazwisko.',
      errOrg: 'Podaj nazwę organizacji lub obiektu.',
      errEmail: 'Podaj poprawny adres e-mail.',
      errType: 'Wybierz rodzaj obiektu.',
      errConsent: 'Bez tej zgody nie możemy się z Tobą skontaktować.',
      errSend: 'Nie udało się wysłać zgłoszenia. Sprawdź połączenie i spróbuj ponownie.',
      orEmail: 'Możesz też napisać na',
      sending: 'Wysyłanie',
      doneTitle: 'Dziękujemy. Obiekt jest na liście.',
      doneText: 'Odezwiemy się mailowo lub telefonicznie, gdy będziemy gotowi porozmawiać o Twoim obiekcie. Do tego czasu nic nie musisz robić.'
    }
  },
  en: {
    hero: {
      outZone: 'OUTSIDE ZONE',
      inZone: 'IN ZONE',
      bearing: 'BEARING'
    },
    node: {
      spin: 'Rotate',
      pause: 'Pause',
      openCover: 'Open cover',
      closeCover: 'Close cover',
      coverOpen: 'COVER OPEN',
      titleDf: 'HERMES ID + DF · parts',
      titleId: 'HERMES ID · parts',
      parts: {
        enclosure: 'IP66/IP67 enclosure',
        pi: 'Raspberry Pi 5',
        esp: 'ESP32-C5 ×2',
        cc: 'CC2652P receiver',
        idant: 'ID antennas',
        kraken: 'KrakenSDR',
        array: 'Direction-finding array',
        clamps: 'Mast clamps'
      }
    },
    form: {
      errName: 'Please enter your name.',
      errOrg: 'Please enter your organisation or site.',
      errEmail: 'Please enter a valid email address.',
      errType: 'Please choose a site type.',
      errConsent: 'We need this consent to be able to contact you.',
      errSend: 'Your submission could not be sent. Check your connection and try again.',
      orEmail: 'You can also write to',
      sending: 'Sending',
      doneTitle: 'Thank you. Your site is on the list.',
      doneText: 'We will get back to you by email or phone when we are ready to talk about your site. Until then there is nothing you need to do.'
    }
  }
};
