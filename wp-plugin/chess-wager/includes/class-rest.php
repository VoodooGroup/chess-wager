<?php

if (!defined('ABSPATH')) {
    exit;
}

class Chess_Wager_REST {
    public static function register() {
        register_rest_route('chess-wager/v1', '/games', [
            [
                'methods'             => 'POST',
                'callback'            => [self::class, 'register_game'],
                'permission_callback' => '__return_true',
            ],
            [
                'methods'             => 'GET',
                'callback'            => [self::class, 'list_games'],
                'permission_callback' => '__return_true',
            ],
        ]);
        register_rest_route('chess-wager/v1', '/games/(?P<id>\d+)', [
            'methods'             => 'GET',
            'callback'            => [self::class, 'get_game'],
            'permission_callback' => '__return_true',
        ]);
        register_rest_route('chess-wager/v1', '/games/(?P<id>\d+)/events', [
            [
                'methods'             => 'POST',
                'callback'            => [self::class, 'post_event'],
                'permission_callback' => '__return_true',
            ],
            [
                'methods'             => 'GET',
                'callback'            => [self::class, 'list_events'],
                'permission_callback' => '__return_true',
            ],
        ]);
        register_rest_route('chess-wager/v1', '/games/(?P<id>\d+)/presence', [
            [
                'methods'             => 'POST',
                'callback'            => [self::class, 'post_presence'],
                'permission_callback' => '__return_true',
            ],
            [
                'methods'             => 'GET',
                'callback'            => [self::class, 'get_presence'],
                'permission_callback' => '__return_true',
            ],
        ]);

        add_filter('rest_pre_serve_request', [self::class, 'cors'], 0, 4);
    }

    public static function cors($served, $result, $request, $server) {
        $route = $request instanceof WP_REST_Request ? $request->get_route() : '';
        if (strpos((string) $route, '/chess-wager/v1') !== 0) {
            return $served;
        }
        $origin = isset($_SERVER['HTTP_ORIGIN']) ? sanitize_text_field(wp_unslash($_SERVER['HTTP_ORIGIN'])) : '';
        $list = Chess_Wager_Settings::origins();
        if (!$list) {
            header('Access-Control-Allow-Origin: *');
        } elseif ($origin && Chess_Wager_Settings::origin_allowed($origin)) {
            header('Access-Control-Allow-Origin: ' . $origin);
            header('Vary: Origin');
        }
        header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
        header('Access-Control-Allow-Headers: Content-Type');
        if ($request->get_method() === 'OPTIONS') {
            status_header(200);
            return true;
        }
        return $served;
    }

    private static function rate_ok() {
        $ip = isset($_SERVER['REMOTE_ADDR']) ? sanitize_text_field(wp_unslash($_SERVER['REMOTE_ADDR'])) : '0';
        $key = 'cw_rl_' . md5($ip);
        $n = (int) get_transient($key);
        if ($n > 180) {
            return false;
        }
        set_transient($key, $n + 1, MINUTE_IN_SECONDS);
        return true;
    }

    private static function addr($raw) {
        $v = strtolower(trim((string) $raw));
        if (!preg_match('/^0x[a-f0-9]{40}$/', $v)) {
            return '';
        }
        return $v;
    }

    private static function game_id($request) {
        return absint($request['id'] ?? 0);
    }

    public static function register_game(WP_REST_Request $request) {
        if (!self::rate_ok()) {
            return new WP_Error('rate', 'Slow down.', ['status' => 429]);
        }
        $body = $request->get_json_params();
        if (!is_array($body)) {
            $body = [];
        }
        $id = absint($body['gameId'] ?? $request->get_param('gameId'));
        if ($id < 1) {
            return new WP_Error('bad', 'Missing game id.', ['status' => 400]);
        }
        global $wpdb;
        $table = Chess_Wager_DB::games_table();
        $now = current_time('mysql');
        $white = self::addr($body['white'] ?? '');
        $black = self::addr($body['black'] ?? '');
        $existing = $wpdb->get_row($wpdb->prepare("SELECT * FROM {$table} WHERE game_id = %d", $id), ARRAY_A);
        $row = [
            'game_id'    => $id,
            'white'      => $white ?: ($existing['white'] ?? ''),
            'black'      => $black ?: ($existing['black'] ?? ''),
            'token'      => substr(sanitize_text_field((string) ($body['token'] ?? ($existing['token'] ?? ''))), 0, 42),
            'amount'     => substr(sanitize_text_field((string) ($body['amount'] ?? ($existing['amount'] ?? ''))), 0, 80),
            'status'     => isset($body['status']) ? absint($body['status']) : (int) ($existing['status'] ?? 0),
            'updated_at' => $now,
        ];
        $wpdb->replace($table, $row);
        return rest_ensure_response(['ok' => true, 'gameId' => $id]);
    }

    public static function list_games() {
        global $wpdb;
        $table = Chess_Wager_DB::games_table();
        $rows = $wpdb->get_results("SELECT * FROM {$table} ORDER BY updated_at DESC LIMIT 50", ARRAY_A);
        return rest_ensure_response(['games' => $rows ?: []]);
    }

    public static function get_game(WP_REST_Request $request) {
        $id = self::game_id($request);
        if ($id < 1) {
            return new WP_Error('bad', 'Missing game id.', ['status' => 400]);
        }
        global $wpdb;
        $row = $wpdb->get_row(
            $wpdb->prepare('SELECT * FROM ' . Chess_Wager_DB::games_table() . ' WHERE game_id = %d', $id),
            ARRAY_A
        );
        if (!$row) {
            return rest_ensure_response(['game' => null]);
        }
        return rest_ensure_response(['game' => $row]);
    }

    public static function post_event(WP_REST_Request $request) {
        if (!self::rate_ok()) {
            return new WP_Error('rate', 'Slow down.', ['status' => 429]);
        }
        $id = self::game_id($request);
        if ($id < 1) {
            return new WP_Error('bad', 'Missing game id.', ['status' => 400]);
        }
        $raw = $request->get_body();
        if (strlen((string) $raw) > 120000) {
            return new WP_Error('big', 'Payload too large.', ['status' => 413]);
        }
        $body = $request->get_json_params();
        if (!is_array($body)) {
            return new WP_Error('bad', 'JSON required.', ['status' => 400]);
        }
        $type = sanitize_key((string) ($body['type'] ?? 'event'));
        if ($type === '' || strlen($type) > 32) {
            $type = 'event';
        }
        $payload = isset($body['payload']) ? $body['payload'] : $body;
        $json = wp_json_encode($payload);
        if ($json === false) {
            return new WP_Error('bad', 'Invalid payload.', ['status' => 400]);
        }
        global $wpdb;
        $wpdb->insert(Chess_Wager_DB::events_table(), [
            'game_id'    => $id,
            'event_type' => $type,
            'payload'    => $json,
            'created_at' => current_time('mysql'),
        ]);
        $from = '';
        if (is_array($payload)) {
            $from = self::addr($payload['from'] ?? $payload['mover'] ?? '');
        }
        self::touch_game($id, $from, $payload);
        return rest_ensure_response(['ok' => true, 'id' => (int) $wpdb->insert_id]);
    }

    public static function list_events(WP_REST_Request $request) {
        $id = self::game_id($request);
        if ($id < 1) {
            return new WP_Error('bad', 'Missing game id.', ['status' => 400]);
        }
        $after = absint($request->get_param('after'));
        global $wpdb;
        $table = Chess_Wager_DB::events_table();
        $rows = $wpdb->get_results(
            $wpdb->prepare(
                "SELECT id, event_type, payload, created_at FROM {$table} WHERE game_id = %d AND id > %d ORDER BY id ASC LIMIT 200",
                $id,
                $after
            ),
            ARRAY_A
        );
        $out = [];
        foreach ($rows ?: [] as $row) {
            $payload = json_decode($row['payload'], true);
            $out[] = [
                'id'      => (int) $row['id'],
                'type'    => $row['event_type'],
                'payload' => $payload,
                'created' => $row['created_at'],
            ];
        }
        return rest_ensure_response(['events' => $out]);
    }

    public static function post_presence(WP_REST_Request $request) {
        if (!self::rate_ok()) {
            return new WP_Error('rate', 'Slow down.', ['status' => 429]);
        }
        $id = self::game_id($request);
        $body = $request->get_json_params();
        $addr = self::addr(is_array($body) ? ($body['address'] ?? '') : '');
        if ($id < 1 || $addr === '') {
            return new WP_Error('bad', 'Need game and wallet.', ['status' => 400]);
        }
        global $wpdb;
        $wpdb->replace(Chess_Wager_DB::presence_table(), [
            'game_id'   => $id,
            'address'   => $addr,
            'last_seen' => gmdate('Y-m-d H:i:s'),
        ]);
        self::touch_game($id, $addr, null);
        return rest_ensure_response(['ok' => true]);
    }

    public static function get_presence(WP_REST_Request $request) {
        $id = self::game_id($request);
        if ($id < 1) {
            return new WP_Error('bad', 'Missing game id.', ['status' => 400]);
        }
        global $wpdb;
        $table = Chess_Wager_DB::presence_table();
        $rows = $wpdb->get_results(
            $wpdb->prepare(
                "SELECT address, last_seen FROM {$table} WHERE game_id = %d AND last_seen >= %s",
                $id,
                gmdate('Y-m-d H:i:s', time() - 120)
            ),
            ARRAY_A
        );
        $out = [];
        foreach ($rows ?: [] as $row) {
            $out[] = [
                'address'   => $row['address'],
                'last_seen' => $row['last_seen'],
                'seen'      => strtotime($row['last_seen'] . ' UTC'),
            ];
        }
        return rest_ensure_response(['players' => $out]);
    }

    private static function touch_game($id, $addr, $payload) {
        global $wpdb;
        $table = Chess_Wager_DB::games_table();
        $row = $wpdb->get_row($wpdb->prepare("SELECT * FROM {$table} WHERE game_id = %d", $id), ARRAY_A);
        $white = $row['white'] ?? '';
        $black = $row['black'] ?? '';
        if (is_array($payload) && isset($payload['states']['last']['currentPlayer'])) {
            // no-op: keep addresses from register / hello
        }
        if ($addr && $white === '') {
            $white = $addr;
        } elseif ($addr && $black === '' && $addr !== $white) {
            $black = $addr;
        }
        $wpdb->replace($table, [
            'game_id'    => $id,
            'white'      => $white,
            'black'      => $black,
            'token'      => $row['token'] ?? '',
            'amount'     => $row['amount'] ?? '',
            'status'     => isset($row['status']) ? (int) $row['status'] : 1,
            'updated_at' => current_time('mysql'),
        ]);
    }
}
