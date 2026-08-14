<?php

if (!defined('ABSPATH')) {
    exit;
}

class Chess_Wager_Settings {
    const OPTION = 'chess_wager_dapp_urls';
    const KEEP_OPTION = 'chess_wager_keep_hours';

    public static function raw() {
        return (string) get_option(self::OPTION, '');
    }

    public static function save($raw) {
        update_option(self::OPTION, sanitize_textarea_field((string) $raw));
    }

    public static function keep_hours() {
        $n = (int) get_option(self::KEEP_OPTION, 48);
        if ($n < 6) {
            $n = 6;
        }
        if ($n > 720) {
            $n = 720;
        }
        return $n;
    }

    public static function save_keep_hours($n) {
        update_option(self::KEEP_OPTION, self::keep_hours_from($n));
    }

    private static function keep_hours_from($n) {
        $n = (int) $n;
        if ($n < 6) {
            $n = 6;
        }
        if ($n > 720) {
            $n = 720;
        }
        return $n;
    }

    public static function urls() {
        $lines = preg_split('/\r\n|\r|\n/', self::raw());
        $out = [];
        foreach ($lines as $line) {
            $u = self::normalize_url($line);
            if ($u !== '') {
                $out[] = $u;
            }
        }
        return array_values(array_unique($out));
    }

    public static function primary() {
        $urls = self::urls();
        return $urls ? $urls[0] : '';
    }

    public static function origins() {
        $out = [];
        foreach (self::urls() as $u) {
            $o = self::origin_of($u);
            if ($o !== '') {
                $out[] = $o;
            }
        }
        $home = self::origin_of(home_url());
        if ($home !== '') {
            $out[] = $home;
        }
        return array_values(array_unique($out));
    }

    public static function origin_allowed($origin) {
        $want = self::origin_of($origin);
        if ($want === '') {
            return false;
        }
        $list = self::origins();
        if (!$list) {
            return true;
        }
        return in_array($want, $list, true);
    }

    public static function normalize_url($line) {
        $line = trim((string) $line);
        if ($line === '') {
            return '';
        }
        if (!preg_match('#^https?://#i', $line)) {
            $line = 'https://' . $line;
        }
        $p = wp_parse_url($line);
        if (empty($p['host'])) {
            return '';
        }
        $scheme = strtolower($p['scheme'] ?? 'https');
        if ($scheme !== 'http' && $scheme !== 'https') {
            return '';
        }
        $port = isset($p['port']) ? ':' . $p['port'] : '';
        $path = isset($p['path']) ? untrailingslashit($p['path']) : '';
        if ($path === '/') {
            $path = '';
        }
        return $scheme . '://' . strtolower($p['host']) . $port . $path;
    }

    public static function origin_of($url) {
        $p = wp_parse_url((string) $url);
        if (empty($p['scheme']) || empty($p['host'])) {
            return '';
        }
        $port = isset($p['port']) ? ':' . $p['port'] : '';
        return strtolower($p['scheme']) . '://' . strtolower($p['host']) . $port;
    }
}
