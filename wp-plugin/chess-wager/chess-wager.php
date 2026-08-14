<?php
/**
 * Plugin Name: Chess Wager
 * Plugin URI: https://voodootoken.com
 * Description: Embeds the Chess Wager dApp and keeps a live relay of who is playing, so a lost internet connection does not wipe the match.
 * Version: 1.3.0
 * Requires at least: 5.8
 * Requires PHP: 7.4
 * Author: Voodoo Token
 * License: GPLv2 or later
 * Text Domain: chess-wager
 *
 * Main file (do not rename): chess-wager/chess-wager.php
 */

if (!defined('ABSPATH')) {
    exit;
}

define('CHESS_WAGER_VER', '1.3.0');
define('CHESS_WAGER_PATH', plugin_dir_path(__FILE__));
define('CHESS_WAGER_URL', plugin_dir_url(__FILE__));
define('CHESS_WAGER_DB_VER', '1');

require_once CHESS_WAGER_PATH . 'includes/class-db.php';
require_once CHESS_WAGER_PATH . 'includes/class-settings.php';
require_once CHESS_WAGER_PATH . 'includes/class-rest.php';
require_once CHESS_WAGER_PATH . 'includes/class-admin.php';

register_activation_hook(__FILE__, static function () {
    Chess_Wager_DB::activate();
    Chess_Wager_DB::schedule();
});
register_deactivation_hook(__FILE__, ['Chess_Wager_DB', 'unschedule']);

add_action('plugins_loaded', static function () {
    Chess_Wager_DB::maybe_upgrade();
    Chess_Wager_DB::schedule();
});
add_action('chess_wager_cleanup', ['Chess_Wager_DB', 'cleanup']);

add_action('rest_api_init', static function () {
    Chess_Wager_REST::register();
});

add_action('admin_menu', static function () {
    Chess_Wager_Admin::menu();
});

add_action('init', static function () {
    add_shortcode('chess_wager', 'chess_wager_shortcode');
});

add_filter('script_loader_tag', static function ($tag, $handle) {
    if ($handle === 'chess-wager-dapp') {
        $tag = str_replace('<script ', '<script type="module" ', $tag);
    }
    return $tag;
}, 10, 2);

function chess_wager_enqueue() {
    $dir = CHESS_WAGER_PATH . 'assets/dapp/assets/';
    $url = CHESS_WAGER_URL . 'assets/dapp/assets/';
    $js  = '';
    $css = '';
    if (is_dir($dir)) {
        foreach (glob($dir . '*.css') ?: [] as $file) {
            $css = basename($file);
        }
        foreach (glob($dir . '*.js') ?: [] as $file) {
            if (substr($file, -4) === '.map') {
                continue;
            }
            $js = basename($file);
        }
    }
    if ($css) {
        wp_enqueue_style('chess-wager-dapp', $url . $css, [], CHESS_WAGER_VER);
    }
    wp_enqueue_style(
        'chess-wager-embed',
        CHESS_WAGER_URL . 'assets/embed.css',
        $css ? ['chess-wager-dapp'] : [],
        CHESS_WAGER_VER
    );
    if ($js) {
        wp_enqueue_script('chess-wager-dapp', $url . $js, [], CHESS_WAGER_VER, true);
        $cfg = [
            'assets'  => CHESS_WAGER_URL . 'assets/dapp/',
            'relay'   => rest_url('chess-wager/v1'),
            'playUrl' => Chess_Wager_Settings::primary(),
        ];
        wp_add_inline_script(
            'chess-wager-dapp',
            'window.CHESS_WAGER_CFG=' . wp_json_encode($cfg) . ';',
            'before'
        );
    }
}

function chess_wager_shortcode() {
    chess_wager_enqueue();
    $dir = CHESS_WAGER_PATH . 'assets/dapp/assets/';
    $has = is_dir($dir) && (glob($dir . '*.js') ?: []);
    if (!$has) {
        if (current_user_can('activate_plugins')) {
            return '<p>Chess Wager assets are missing. Re-upload the full plugin zip so the <code>assets/dapp</code> folder is included.</p>';
        }
        return '<p>Chess Wager is not ready on this site yet.</p>';
    }
    return '<div class="chess-wager-wrap"><div id="app" class="chess-wager-root"></div></div>';
}
