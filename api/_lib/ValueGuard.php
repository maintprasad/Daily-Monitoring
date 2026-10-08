<?php
declare(strict_types=1);

/**
 * Pengaman nilai parameter monitoring.
 *
 * Masalah lama: Google Sheets membaca angka yang diketik crew sebagai tanggal.
 *   - Desimal "12,2" / "12.2"   → tanggal 12 Feb tahun berjalan → "Thu Feb 12 2026 00:00:00 GMT+0700"
 *   - Angka bulat 35            → nomor seri tanggal ke-35        → "Sat Feb 03 1900 00:00:00 GMT+0642"
 * Kedua bentuk ini bisa dihitung balik dengan pasti. Logika yang sama dipakai
 * Data Recovery Tool di aplikasi (assets/js/tools/data-recovery.js).
 */
final class ValueGuard
{
    private const MONTHS = ['Jan' => 1, 'Feb' => 2, 'Mar' => 3, 'Apr' => 4, 'May' => 5, 'Jun' => 6,
                            'Jul' => 7, 'Aug' => 8, 'Sep' => 9, 'Oct' => 10, 'Nov' => 11, 'Dec' => 12];

    /** Sama dengan isCorruptDateValue() di Data Recovery Tool (tanpa aturan serial 40000–60000). */
    public static function looksLikeDate(string $s): bool
    {
        $s = trim($s);
        return (bool) preg_match('~^(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2}\s+\d{4}~', $s)
            || preg_match('~^\d{4}-\d{2}-\d{2}(T|\s)~', $s)
            || preg_match('~^\d{1,2}/\d{1,2}/\d{4}$~', $s)
            || preg_match('~^\d{1,2}-\d{1,2}-\d{4}$~', $s)
            || preg_match('~^\d{4}-\d{1,2}-\d{1,2}$~', $s);
    }

    /** Angka ≥10 digit tanpa desimal — bug timestamp (sama dengan Scan Big Error). */
    public static function isBigError(string $s): bool
    {
        return (bool) preg_match('~^-?\d{10,}$~', trim($s));
    }

    /**
     * Hitung balik nilai asli dari teks tanggal. null = tidak bisa dipastikan.
     *   tahun 1899–1910 → nomor seri tanggal (jumlah hari sejak 30 Des 1899)
     *   tahun 2000–2100 → desimal "hari.bulan" (format Indonesia: 12,2 → 12 Feb)
     */
    public static function recoverDate(string $s): ?string
    {
        $s = trim($s);
        $ymd = null;
        $secs = 0; // jam di dalam tanggal = bagian pecahan nomor seri
        if (preg_match('~^(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{1,2})\s+(\d{4})(?:\s+(\d{2}):(\d{2}):(\d{2}))?~', $s, $m)) {
            $ymd = [(int) $m[3], self::MONTHS[$m[1]], (int) $m[2]];
            $secs = isset($m[4]) ? (int) $m[4] * 3600 + (int) $m[5] * 60 + (int) $m[6] : 0;
        } elseif (preg_match('~^\d{4}-\d{2}-\d{2}T.*(Z|[+-]\d{2}:?\d{2})$~', $s)) {
            // ISO dengan zona waktu (biasanya UTC) → tanggal versi WIB
            try {
                $dt = (new DateTimeImmutable($s))->setTimezone(new DateTimeZone('Asia/Jakarta'));
            } catch (Exception $e) {
                return null;
            }
            $ymd = [(int) $dt->format('Y'), (int) $dt->format('n'), (int) $dt->format('j')];
            $secs = (int) $dt->format('G') * 3600 + (int) $dt->format('i') * 60 + (int) $dt->format('s');
        } elseif (preg_match('~^(\d{4})-(\d{1,2})-(\d{1,2})~', $s, $m)) {
            $ymd = [(int) $m[1], (int) $m[2], (int) $m[3]];
        } elseif (preg_match('~^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$~', $s, $m)) {
            $ymd = [(int) $m[3], (int) $m[2], (int) $m[1]]; // DD/MM/YYYY (locale Indonesia)
        }
        if ($ymd === null || !checkdate($ymd[1], $ymd[2], $ymd[0])) {
            return null;
        }
        [$y, $mo, $d] = $ymd;
        if ($y >= 1899 && $y <= 1910) {
            $base = new DateTimeImmutable('1899-12-30', new DateTimeZone('UTC'));
            $date = new DateTimeImmutable(sprintf('%04d-%02d-%02d', $y, $mo, $d), new DateTimeZone('UTC'));
            $serial = $base->diff($date)->days + $secs / 86400;
            return rtrim(rtrim(number_format($serial, 4, '.', ''), '0'), '.');
        }
        if ($y >= 2000 && $y <= 2100) {
            return $d . '.' . $mo;
        }
        return null;
    }

    /**
     * Bersihkan satu nilai item sebelum disimpan.
     * @return array{0:string,1:?string} [nilai baru, catatan tambahan atau null jika tidak berubah]
     */
    public static function sanitize(string $value): array
    {
        $v = trim($value);
        if ($v === '') {
            return ['', null];
        }
        if (preg_match('~^-?\d+,\d+$~', $v)) {
            return [str_replace(',', '.', $v), null]; // koma desimal → titik
        }
        if (self::looksLikeDate($v)) {
            $rec = self::recoverDate($v);
            return $rec !== null
                ? [$rec, "[dipulihkan: $v → $rec]"]
                : ['', "[dibersihkan: nilai asli $v]"];
        }
        if (self::isBigError($v)) {
            return ['', "[dibersihkan: nilai asli $v]"];
        }
        return [$v, null];
    }
}
