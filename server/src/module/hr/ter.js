/**
 * BE/src/module/hr/ter.js
 * Konfigurasi Tarif Efektif Rata-Rata (TER) Bulanan PPh 21
 * Berdasarkan Lampiran Peraturan Pemerintah Nomor 58 Tahun 2023 (PMK 168/2023)
 */

// Kategori A (TK/0, TK/1, K/0)
const TER_A = [
    { limit: 5_400_000, rate: 0.0000 },
    { limit: 5_650_000, rate: 0.0025 },
    { limit: 5_950_000, rate: 0.0050 },
    { limit: 6_300_000, rate: 0.0075 },
    { limit: 6_750_000, rate: 0.0100 },
    { limit: 7_500_000, rate: 0.0125 },
    { limit: 8_550_000, rate: 0.0150 },
    { limit: 9_650_000, rate: 0.0175 },
    { limit: 10_050_000, rate: 0.0200 },
    { limit: 10_350_000, rate: 0.0225 },
    { limit: 10_700_000, rate: 0.0250 },
    { limit: 11_050_000, rate: 0.0300 },
    { limit: 11_600_000, rate: 0.0400 },
    { limit: 12_500_000, rate: 0.0500 },
    { limit: 13_750_000, rate: 0.0600 },
    { limit: 15_100_000, rate: 0.0700 },
    { limit: 16_950_000, rate: 0.0800 },
    { limit: 19_750_000, rate: 0.0900 },
    { limit: 24_100_000, rate: 0.1000 },
    { limit: 26_450_000, rate: 0.1100 },
    { limit: 28_000_000, rate: 0.1200 },
    { limit: 30_050_000, rate: 0.1300 },
    { limit: 32_400_000, rate: 0.1400 },
    { limit: 35_400_000, rate: 0.1500 },
    { limit: 39_100_000, rate: 0.1600 },
    { limit: 43_850_000, rate: 0.1700 },
    { limit: 47_800_000, rate: 0.1800 },
    { limit: 51_400_000, rate: 0.1900 },
    { limit: 56_300_000, rate: 0.2000 },
    { limit: 62_200_000, rate: 0.2100 },
    { limit: 68_600_000, rate: 0.2200 },
    { limit: 77_500_000, rate: 0.2300 },
    { limit: 89_000_000, rate: 0.2400 },
    { limit: 103_000_000, rate: 0.2500 },
    { limit: 125_000_000, rate: 0.2600 },
    { limit: 157_000_000, rate: 0.2700 },
    { limit: 206_000_000, rate: 0.2800 },
    { limit: 337_000_000, rate: 0.2900 },
    { limit: 454_000_000, rate: 0.3000 },
    { limit: 550_000_000, rate: 0.3100 },
    { limit: 695_000_000, rate: 0.3200 },
    { limit: 910_000_000, rate: 0.3300 },
    { limit: 1_400_000_000, rate: 0.3400 },
    { limit: Infinity, rate: 0.3400 },
];

// Kategori B (TK/2, TK/3, K/1, K/2)
const TER_B = [
    { limit: 6_200_000, rate: 0.0000 },
    { limit: 6_500_000, rate: 0.0025 },
    { limit: 6_850_000, rate: 0.0050 },
    { limit: 7_300_000, rate: 0.0075 },
    { limit: 9_200_000, rate: 0.0100 },
    { limit: 10_750_000, rate: 0.0150 },
    { limit: 11_250_000, rate: 0.0200 },
    { limit: 11_600_000, rate: 0.0250 },
    { limit: 12_600_000, rate: 0.0300 },
    { limit: 13_600_000, rate: 0.0400 },
    { limit: 14_950_000, rate: 0.0500 },
    { limit: 16_400_000, rate: 0.0600 },
    { limit: 18_450_000, rate: 0.0700 },
    { limit: 21_850_000, rate: 0.0800 },
    { limit: 26_000_000, rate: 0.0900 },
    { limit: 27_700_000, rate: 0.1000 },
    { limit: 29_350_000, rate: 0.1100 },
    { limit: 31_450_000, rate: 0.1200 },
    { limit: 33_950_000, rate: 0.1300 },
    { limit: 37_100_000, rate: 0.1400 },
    { limit: 41_100_000, rate: 0.1500 },
    { limit: 45_800_000, rate: 0.1600 },
    { limit: 49_500_000, rate: 0.1700 },
    { limit: 53_800_000, rate: 0.1800 },
    { limit: 58_500_000, rate: 0.1900 },
    { limit: 64_000_000, rate: 0.2000 },
    { limit: 71_000_000, rate: 0.2100 },
    { limit: 80_000_000, rate: 0.2200 },
    { limit: 93_000_000, rate: 0.2300 },
    { limit: 109_000_000, rate: 0.2400 },
    { limit: 132_000_000, rate: 0.2500 },
    { limit: 165_000_000, rate: 0.2600 },
    { limit: 218_000_000, rate: 0.2700 },
    { limit: 355_000_000, rate: 0.2800 },
    { limit: 483_000_000, rate: 0.2900 },
    { limit: 585_000_000, rate: 0.3000 },
    { limit: 740_000_000, rate: 0.3100 },
    { limit: 965_000_000, rate: 0.3200 },
    { limit: 1_490_000_000, rate: 0.3300 },
    { limit: Infinity, rate: 0.3400 },
];

// Kategori C (K/3)
const TER_C = [
    { limit: 6_600_000, rate: 0.0000 },
    { limit: 6_950_000, rate: 0.0025 },
    { limit: 7_350_000, rate: 0.0050 },
    { limit: 7_800_000, rate: 0.0075 },
    { limit: 8_850_000, rate: 0.0100 },
    { limit: 9_800_000, rate: 0.0125 },
    { limit: 10_950_000, rate: 0.0150 },
    { limit: 11_200_000, rate: 0.0175 },
    { limit: 12_050_000, rate: 0.0200 },
    { limit: 12_950_000, rate: 0.0300 },
    { limit: 14_150_000, rate: 0.0400 },
    { limit: 15_550_000, rate: 0.0500 },
    { limit: 17_050_000, rate: 0.0600 },
    { limit: 19_500_000, rate: 0.0700 },
    { limit: 22_700_000, rate: 0.0800 },
    { limit: 26_600_000, rate: 0.0900 },
    { limit: 28_100_000, rate: 0.1000 },
    { limit: 30_100_000, rate: 0.1100 },
    { limit: 32_600_000, rate: 0.1200 },
    { limit: 35_400_000, rate: 0.1300 },
    { limit: 38_900_000, rate: 0.1400 },
    { limit: 43_000_000, rate: 0.1500 },
    { limit: 47_400_000, rate: 0.1600 },
    { limit: 51_200_000, rate: 0.1700 },
    { limit: 55_800_000, rate: 0.1800 },
    { limit: 60_400_000, rate: 0.1900 },
    { limit: 66_700_000, rate: 0.2000 },
    { limit: 74_500_000, rate: 0.2100 },
    { limit: 83_200_000, rate: 0.2200 },
    { limit: 95_600_000, rate: 0.2300 },
    { limit: 113_000_000, rate: 0.2400 },
    { limit: 137_000_000, rate: 0.2500 },
    { limit: 173_000_000, rate: 0.2600 },
    { limit: 225_000_000, rate: 0.2700 },
    { limit: 367_000_000, rate: 0.2800 },
    { limit: 504_000_000, rate: 0.2900 },
    { limit: 605_000_000, rate: 0.3000 },
    { limit: 770_000_000, rate: 0.3100 },
    { limit: 1_010_000_000, rate: 0.3200 },
    { limit: 1_540_000_000, rate: 0.3300 },
    { limit: Infinity, rate: 0.3400 },
];

/**
 * Mendapatkan persen tarif sesuai kategori PTKP dan Bruto Bulanan.
 * @param {string} ptkpStatus 
 * @param {number} brutoBulanan 
 */
function getRateTER(ptkpStatus, brutoBulanan) {
    const arrA = ['TK/0', 'TK/1', 'K/0'];
    const arrB = ['TK/2', 'TK/3', 'K/1', 'K/2'];
    const arrC = ['K/3'];
    
    // Default fallback to A if unknown
    let targetBracket = TER_A;
    let kategori = 'A';

    if (arrB.includes(ptkpStatus)) {
        targetBracket = TER_B;
        kategori = 'B';
    } else if (arrC.includes(ptkpStatus)) {
        targetBracket = TER_C;
        kategori = 'C';
    }

    // Lookup berdasarkan upper limit (di mana brutoBulanan <= limit)
    let selectedRate = targetBracket[targetBracket.length - 1].rate; // default max
    let matchedLimit = "Lebih dari Limit Akhir";
    
    for (const b of targetBracket) {
        if (brutoBulanan <= b.limit) {
            selectedRate = b.rate;
            matchedLimit = b.limit;
            break;
        }
    }

    return { kategori, rate: selectedRate, matchedLimit };
}

module.exports = {
    TER_A, TER_B, TER_C, getRateTER
};
