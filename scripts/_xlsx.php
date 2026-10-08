<?php
declare(strict_types=1);

/**
 * Pembaca .xlsx minimal (tanpa library): SheetName => [baris asosiatif per header].
 * Cukup untuk ekspor Google Sheets (sharedStrings + inlineStr). Sel kosong → ''.
 * Zip dibaca langsung dengan zlib (gzinflate) — tidak perlu ekstensi zip.
 */
final class XlsxReader
{
    /** @return array<string, list<array<string,string>>> */
    public static function read(string $file): array
    {
        if (!is_file($file)) {
            throw new RuntimeException("File tidak ditemukan: $file");
        }
        $files = self::unzip((string) file_get_contents($file));
        $strings = [];
        if (isset($files["xl/sharedStrings.xml"])) {
            $x = simplexml_load_string($files["xl/sharedStrings.xml"]);
            foreach ($x->si as $si) {
                $t = "";
                if (isset($si->t)) {
                    $t = (string) $si->t;
                } else {
                    foreach ($si->r as $r) {
                        $t .= (string) $r->t;
                    }
                }
                $strings[] = $t;
            }
        }

        $wb = simplexml_load_string($files["xl/workbook.xml"] ?? throw new RuntimeException("Bukan file xlsx yang valid."));
        $rels = simplexml_load_string($files["xl/_rels/workbook.xml.rels"]);
        $target = [];
        foreach ($rels->Relationship as $rel) {
            $target[(string) $rel["Id"]] = ltrim((string) $rel["Target"], "/");
        }

        $book = [];
        foreach ($wb->sheets->sheet as $sheet) {
            $rid = (string) $sheet->attributes("http://schemas.openxmlformats.org/officeDocument/2006/relationships")["id"];
            $path = $target[$rid] ?? "";
            $path = str_starts_with($path, "xl/") ? $path : "xl/" . $path;
            $book[(string) $sheet["name"]] = self::parseSheet($files[$path] ?? "", $strings);
        }
        return $book;
    }

    /** Baca isi zip lewat central directory (hanya metode stored/deflate, cukup untuk xlsx). */
    private static function unzip(string $zip): array
    {
        $eocd = strrpos($zip, "PK\x05\x06");
        if ($eocd === false) {
            throw new RuntimeException("Bukan file zip/xlsx yang valid.");
        }
        $meta = unpack("vcount/Vsize/Voffset", substr($zip, $eocd + 10, 10));
        $pos = $meta["offset"];
        $out = [];
        for ($i = 0; $i < $meta["count"]; $i++) {
            $h = unpack("Vsig/vmade/vneed/vflag/vmethod/vtime/vdate/Vcrc/Vcsize/Vsize/vnlen/velen/vclen/vdisk/vint/Vext/Voff", substr($zip, $pos, 46));
            $name = substr($zip, $pos + 46, $h["nlen"]);
            $pos += 46 + $h["nlen"] + $h["elen"] + $h["clen"];
            if (str_ends_with($name, "/")) {
                continue;
            }
            $l = unpack("vnlen/velen", substr($zip, $h["off"] + 26, 4));
            $data = substr($zip, $h["off"] + 30 + $l["nlen"] + $l["elen"], $h["csize"]);
            $out[$name] = $h["method"] === 8 ? gzinflate($data) : $data;
        }
        return $out;
    }

    private static function parseSheet(string $xml, array $strings): array
    {
        $r = new XMLReader();
        $r->XML($xml);
        $header = null;
        $rows = [];
        while ($r->read()) {
            if ($r->nodeType !== XMLReader::ELEMENT || $r->name !== 'row') {
                continue;
            }
            $cells = [];
            $row = simplexml_load_string($r->readOuterXml());
            foreach ($row->c as $c) {
                $col = self::colIndex((string) $c['r']);
                $v = (string) $c->v;
                $t = (string) $c['t'];
                if ($t === 's') {
                    $v = $strings[(int) $v] ?? '';
                } elseif ($t === 'inlineStr') {
                    $v = (string) $c->is->t;
                }
                $cells[$col] = $v;
            }
            if ($header === null) {
                $header = $cells;
                continue;
            }
            $assoc = [];
            foreach ($header as $i => $name) {
                if ($name !== '') {
                    $assoc[$name] = $cells[$i] ?? '';
                }
            }
            if (array_filter($assoc, fn ($v) => $v !== '')) {
                $rows[] = $assoc;
            }
        }
        $r->close();
        return $rows;
    }

    private static function colIndex(string $ref): int
    {
        preg_match('~^[A-Z]+~', $ref, $m);
        $n = 0;
        foreach (str_split($m[0] ?? 'A') as $ch) {
            $n = $n * 26 + (ord($ch) - 64);
        }
        return $n - 1;
    }
}
