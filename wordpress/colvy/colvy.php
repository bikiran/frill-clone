<?php
/**
 * Plugin Name:       Colvy
 * Plugin URI:        https://colvy.com
 * Description:       Colvy for WordPress & WooCommerce, in one plugin — chat widget, order and abandoned-cart sync, "Notify me" on sold-out products, booking page embed, branding and live stats from your Colvy inbox.
 * Version:           3.0.3
 * Author:            Colvy
 * Author URI:        https://colvy.com
 * Requires at least: 6.0
 * Requires PHP:      7.4
 * WC tested up to:   9.9
 * Text Domain:       colvy
 *
 * Replaces the old "Colvy Dashboard" and "Colvy Bridge for WooCommerce"
 * plugins and keeps their settings, so there's nothing to re-enter.
 */

if ( ! defined( 'ABSPATH' ) ) exit;
if ( defined( 'COLVYWP_VERSION' ) ) return; // a second copy is installed — the first one runs

define( 'COLVYWP_VERSION', '3.0.3' );
define( 'COLVYWP_FILE', __FILE__ );
define( 'COLVYWP_URL', plugin_dir_url( __FILE__ ) );
if ( ! defined( 'COLVY_API_BASE' ) ) define( 'COLVY_API_BASE', 'https://colvy.com' );

/* ───────────────────────────── Settings ───────────────────────────── */
// Same option the old plugin used: company_id, api_key, slug_cache (+ widget).

function colvywp_get( $k, $d = '' ) { $o = get_option( 'colvy_settings', array() ); return is_array( $o ) && isset( $o[ $k ] ) ? $o[ $k ] : $d; }
function colvywp_set( $vals ) { $o = get_option( 'colvy_settings', array() ); update_option( 'colvy_settings', array_merge( is_array( $o ) ? $o : array(), $vals ) ); }
function colvywp_connected() { return colvywp_get( 'company_id' ) && colvywp_get( 'api_key' ); }

/* ───────────────────────────── API ───────────────────────────── */

/** GET/POST to Colvy as this company. Returns the decoded body, or WP_Error. */
function colvywp_api( $method, $path, $body = null, $blocking = true ) {
	$id = colvywp_get( 'company_id' ); $key = colvywp_get( 'api_key' );
	if ( ! $id || ! $key ) return new WP_Error( 'colvy_not_connected', 'Colvy isn’t connected yet.' );
	$url  = rtrim( COLVY_API_BASE, '/' ) . $path;
	$args = array(
		'timeout'  => $blocking ? 15 : 3,
		'blocking' => $blocking,
		'headers'  => array( 'Content-Type' => 'application/json', 'X-Colvy-Key' => $key ),
	);
	if ( $method === 'GET' ) {
		$res = wp_remote_get( add_query_arg( 'company_id', rawurlencode( $id ), $url ), $args );
	} else {
		$args['body'] = wp_json_encode( array_merge( array( 'company_id' => $id ), (array) $body ) );
		$res = wp_remote_post( $url, $args );
	}
	if ( is_wp_error( $res ) || ! $blocking ) return $res;
	$code = wp_remote_retrieve_response_code( $res );
	$data = json_decode( wp_remote_retrieve_body( $res ), true );
	if ( $code >= 400 ) return new WP_Error( 'colvy_http_' . $code, is_array( $data ) && ! empty( $data['error'] ) ? $data['error'] : 'Colvy didn’t accept that (' . $code . ').' );
	return is_array( $data ) ? $data : array();
}

/** Company + stats, cached for 5 minutes (the admin pages read it a lot). */
function colvywp_account( $fresh = false ) {
	$a = $fresh ? false : get_transient( 'colvywp_account' );
	if ( $a === false ) {
		$a = colvywp_api( 'GET', '/api/plugin/settings' );
		if ( is_wp_error( $a ) ) return $a;
		set_transient( 'colvywp_account', $a, 5 * MINUTE_IN_SECONDS );
		if ( ! empty( $a['company']['slug'] ) ) colvywp_set( array( 'slug_cache' => $a['company']['slug'] ) );
		if ( ! empty( $a['company']['accent_color'] ) ) update_option( 'colvywp_accent', $a['company']['accent_color'], true );
	}
	return $a;
}

function colvywp_accent() {
	$c = (string) get_option( 'colvywp_accent', '' );
	if ( ! $c ) { $a = get_transient( 'colvywp_account' ); $c = is_array( $a ) && ! empty( $a['company']['accent_color'] ) ? $a['company']['accent_color'] : ''; }
	return preg_match( '/^#[0-9a-f]{6}$/i', $c ) ? $c : '#ff7a6b';
}

/* ───────────────────────── Replace the old plugin ───────────────────────── */
// The old single-file "Colvy Dashboard" plugin defines colvy_render_dashboard().
// Switch it off so there's one Colvy plugin (and one chat widget).

function colvywp_old_plugins() {
	if ( ! function_exists( 'get_plugins' ) ) require_once ABSPATH . 'wp-admin/includes/plugin.php';
	$out = array();
	foreach ( get_plugins() as $file => $p ) {
		if ( plugin_basename( COLVYWP_FILE ) === $file ) continue;
		if ( in_array( $p['Name'], array( 'Colvy Dashboard', 'Colvy Bridge for WooCommerce', 'Colvy', 'Colvy — Back in stock' ), true ) && is_plugin_active( $file ) ) $out[] = $file;
	}
	return $out;
}
register_activation_hook( __FILE__, function () {
	$old = colvywp_old_plugins();
	if ( $old ) { deactivate_plugins( $old, true ); set_transient( 'colvywp_replaced', 1, HOUR_IN_SECONDS ); }
} );
add_action( 'admin_init', function () {
	if ( ( function_exists( 'colvy_render_dashboard' ) || function_exists( 'colvy_send_cart' ) ) && current_user_can( 'activate_plugins' ) ) {
		$old = colvywp_old_plugins();
		if ( $old ) { deactivate_plugins( $old, true ); set_transient( 'colvywp_replaced', 1, HOUR_IN_SECONDS ); }
	}
} );
add_action( 'admin_notices', function () {
	if ( ! get_transient( 'colvywp_replaced' ) || ! current_user_can( 'activate_plugins' ) ) return;
	delete_transient( 'colvywp_replaced' );
	echo '<div class="notice notice-success is-dismissible"><p><strong>Colvy 3</strong> now does everything the old Colvy Dashboard and Colvy Bridge for WooCommerce plugins did, so they’ve been switched off — your connection and settings carried over. You can delete them from Plugins.</p></div>';
} );

/* ───────────────────────────── Modules ───────────────────────────── */

require_once __DIR__ . '/includes/back-in-stock.php';
require_once __DIR__ . '/includes/woocommerce.php';

/* ───────────────────────────── Admin menu ───────────────────────────── */

function colvywp_menu_icon() {
	$svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><path fill="black" d="M2.6 8.3c0-1 .6-1.8 1.6-2.1l10.2-3c1.3-.4 2.4.5 2.4 1.8v4.4c0 1-.6 1.8-1.6 2.1L5 14.4c-1.3.4-2.4-.5-2.4-1.8z"/><path fill="black" d="M7.6 13.6c0-.8.5-1.4 1.2-1.6l6.5-1.9c.9-.3 1.7.4 1.7 1.3v3.8c0 .8-.6 1.4-1.4 1.4H9c-.8 0-1.4-.6-1.4-1.4z"/></svg>';
	return 'data:image/svg+xml;base64,' . base64_encode( $svg );
}

function colvywp_pages() {
	return array(
		'colvy-dashboard'     => 'Overview',
		'colvy-woocommerce'   => 'WooCommerce',
		'colvy-back-in-stock' => 'Back in stock',
		'colvy-branding'      => 'Branding',
		'colvy-settings'      => 'Connection',
	);
}

add_action( 'admin_menu', function () {
	add_menu_page( 'Colvy', 'Colvy', 'manage_options', 'colvy-dashboard', 'colvywp_page_overview', colvywp_menu_icon(), 58 );
	add_submenu_page( 'colvy-dashboard', 'Colvy', 'Overview', 'manage_options', 'colvy-dashboard', 'colvywp_page_overview' );
	add_submenu_page( 'colvy-dashboard', 'WooCommerce — Colvy', 'WooCommerce', 'manage_options', 'colvy-woocommerce', 'colvywp_page_woocommerce' );
	add_submenu_page( 'colvy-dashboard', 'Back in stock — Colvy', 'Back in stock', 'manage_options', 'colvy-back-in-stock', 'colvy_bis_admin_page' );
	add_submenu_page( 'colvy-dashboard', 'Branding — Colvy', 'Branding', 'manage_options', 'colvy-branding', 'colvywp_page_branding' );
	add_submenu_page( 'colvy-dashboard', 'Connection — Colvy', 'Connection', 'manage_options', 'colvy-settings', 'colvywp_page_connection' );
	// The old bridge lived at WooCommerce → Colvy (?page=colvy) — keep that link working.
	if ( ! function_exists( 'colvy_settings_page' ) ) {
		$h = add_submenu_page( 'options.php', 'Colvy', 'Colvy', 'manage_options', 'colvy', '__return_null' );
		if ( $h ) add_action( 'load-' . $h, function () { wp_safe_redirect( admin_url( 'admin.php?page=colvy-woocommerce' ) ); exit; } );
	}
} );

add_action( 'admin_enqueue_scripts', function ( $hook ) {
	$page = isset( $_GET['page'] ) ? sanitize_key( $_GET['page'] ) : ''; // phpcs:ignore
	if ( ! isset( colvywp_pages()[ $page ] ) ) return;
	wp_enqueue_style( 'colvywp-admin', COLVYWP_URL . 'assets/admin.css', array(), COLVYWP_VERSION );
	if ( $page === 'colvy-branding' ) { wp_enqueue_media(); wp_enqueue_style( 'wp-color-picker' ); wp_enqueue_script( 'wp-color-picker' ); }
	wp_enqueue_script( 'colvywp-admin', COLVYWP_URL . 'assets/admin.js', array( 'jquery' ), COLVYWP_VERSION, true );
	if ( $page === 'colvy-back-in-stock' ) {
		wp_enqueue_style( 'colvy-bis', COLVYWP_URL . 'assets/bis.css', array(), COLVYWP_VERSION );
		wp_enqueue_script( 'colvy-bis', COLVYWP_URL . 'assets/bis.js', array(), COLVYWP_VERSION, true );
		wp_localize_script( 'colvy-bis', 'colvyBis', array( 'ajax' => admin_url( 'admin-ajax.php' ) ) );
	}
} );

/* ───────────────────────────── Shared UI ───────────────────────────── */

function colvywp_i( $name, $size = 18 ) {
	$p = array(
		'inbox'    => '<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.5 5.1 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.5-6.9A2 2 0 0 0 16.8 4H7.2a2 2 0 0 0-1.7 1.1z"/>',
		'chat'     => '<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20.5l1.4-4.6A8 8 0 1 1 21 12z"/>',
		'calendar' => '<rect x="3" y="4.5" width="18" height="16.5" rx="2.5"/><path d="M16 2.5v4M8 2.5v4M3 10h18"/>',
		'bell'     => '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/>',
		'users'    => '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8"/>',
		'bulb'     => '<path d="M9 18h6M10 22h4"/><path d="M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.2 1 2V17h6v-.3c0-.8.4-1.5 1-2A7 7 0 0 0 12 2z"/>',
		'book'     => '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5z"/><path d="M4 19.5A2.5 2.5 0 0 0 6.5 22H20v-5"/>',
		'ext'      => '<path d="M7 17 17 7"/><path d="M8 7h9v9"/>',
		'link'     => '<path d="M10 13a5 5 0 0 0 7.07 0l3-3a5 5 0 0 0-7.07-7.07l-1.5 1.5"/><path d="M14 11a5 5 0 0 0-7.07 0l-3 3a5 5 0 0 0 7.07 7.07l1.5-1.5"/>',
		'check'    => '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
		'warn'     => '<path d="M10.3 3.9 2.4 17.5A2 2 0 0 0 4.1 20.5h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9.5v4M12 17h.01"/>',
		'palette'  => '<circle cx="13.5" cy="6.5" r="1.5"/><circle cx="17.5" cy="10.5" r="1.5"/><circle cx="8.5" cy="7.5" r="1.5"/><circle cx="6.5" cy="12.5" r="1.5"/><path d="M12 2a10 10 0 0 0 0 20c1 0 1.5-.8 1.5-1.6 0-.4-.2-.8-.4-1.1-.3-.3-.4-.7-.4-1.1 0-.9.7-1.6 1.6-1.6H16a6 6 0 0 0 6-6c0-4.9-4.5-8.6-10-8.6z"/>',
		'plug'     => '<path d="M9 2v6M15 2v6M6 8h12v3a6 6 0 0 1-12 0z"/><path d="M12 17v5"/>',
		'cart'     => '<circle cx="9" cy="20" r="1.4"/><circle cx="18" cy="20" r="1.4"/><path d="M2.5 3h3l2.4 12h11l2-8H7"/>',
		'star'     => '<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9z"/>',
	);
	return '<svg class="cw-ic" width="' . (int) $size . '" height="' . (int) $size . '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' . ( isset( $p[ $name ] ) ? $p[ $name ] : '' ) . '</svg>';
}

/** Page header: logo, business, "Open Colvy", and the section tabs. */
function colvywp_header( $active, $sub = '' ) {
	$acc  = colvywp_connected() ? colvywp_account() : null;
	$ok   = $acc && ! is_wp_error( $acc );
	$name = $ok ? $acc['company']['name'] : 'Colvy';
	$logo = $ok && ! empty( $acc['company']['logo_url'] ) ? $acc['company']['logo_url'] : '';
	?>
	<div class="cw-top">
		<div class="cw-brand">
			<img class="cw-mark" src="<?php echo esc_url( COLVYWP_URL . 'assets/logo.png' ); ?>" alt="Colvy" width="40" height="40">
			<div>
				<h1 class="cw-h1"><?php echo esc_html( $name ); ?> <span class="cw-on">on Colvy</span></h1>
				<p class="cw-sub"><?php echo esc_html( $sub ?: 'Inbox, customers, bookings and reviews — connected to your website.' ); ?></p>
			</div>
			<?php if ( $logo ) : ?><img class="cw-biz" src="<?php echo esc_url( $logo ); ?>" alt=""><?php endif; ?>
		</div>
		<?php if ( $ok ) : ?>
		<div class="cw-actions">
			<a class="cw-btn cw-btn-ghost" href="<?php echo esc_url( $acc['company']['board_url'] ); ?>" target="_blank" rel="noopener">Feedback board <?php echo colvywp_i( 'ext', 14 ); // phpcs:ignore ?></a>
			<a class="cw-btn" href="<?php echo esc_url( ! empty( $acc['company']['app_url'] ) ? $acc['company']['app_url'] . '/inbox' : 'https://colvy.com/admin/inbox' ); ?>" target="_blank" rel="noopener"><?php echo colvywp_i( 'inbox', 16 ); // phpcs:ignore ?> Open Colvy</a>
		</div>
		<?php endif; ?>
	</div>
	<nav class="cw-tabs">
		<?php foreach ( colvywp_pages() as $slug => $label ) : ?>
			<a href="<?php echo esc_url( admin_url( 'admin.php?page=' . $slug ) ); ?>" class="<?php echo $slug === $active ? 'on' : ''; ?>"><?php echo esc_html( $label ); ?></a>
		<?php endforeach; ?>
	</nav>
	<hr class="wp-header-end">
	<?php
	return $ok ? $acc : ( $acc ?: null );
}

function colvywp_notice( $type, $msg ) {
	echo '<div class="cw-note cw-note-' . esc_attr( $type ) . '">' . colvywp_i( $type === 'ok' ? 'check' : 'warn', 16 ) . '<span>' . wp_kses_post( $msg ) . '</span></div>'; // phpcs:ignore
}

/* ───────────────────────────── Overview ───────────────────────────── */

function colvywp_page_overview() {
	if ( ! current_user_can( 'manage_options' ) ) return;
	if ( isset( $_POST['colvywp_widget_nonce'] ) && wp_verify_nonce( sanitize_text_field( wp_unslash( $_POST['colvywp_widget_nonce'] ) ), 'colvywp_widget' ) ) {
		colvywp_set( array( 'widget' => empty( $_POST['widget'] ) ? 'off' : 'on' ) );
	}
	echo '<div class="wrap cw">';
	$acc = colvywp_header( 'colvy-dashboard' );
	if ( ! colvywp_connected() ) {
		?>
		<div class="cw-card cw-hero">
			<h2>Connect your Colvy account</h2>
			<p>Two values from Colvy and you're done — no file editing.</p>
			<ol class="cw-steps">
				<li>In Colvy, open <strong>Settings → API</strong>.</li>
				<li>Copy your <strong>Company ID</strong> and <strong>API key</strong>.</li>
				<li>Paste them under <strong>Connection</strong> here.</li>
			</ol>
			<a class="cw-btn" href="<?php echo esc_url( admin_url( 'admin.php?page=colvy-settings' ) ); ?>">Connect Colvy</a>
		</div>
		<?php
		echo '</div>'; return;
	}
	if ( is_wp_error( $acc ) || ! $acc ) { colvywp_notice( 'warn', 'Couldn’t reach Colvy: ' . esc_html( is_wp_error( $acc ) ? $acc->get_error_message() : 'unknown error' ) . ' — check <a href="' . esc_url( admin_url( 'admin.php?page=colvy-settings' ) ) . '">Connection</a>.' ); echo '</div>'; return; }

	$c = $acc['company']; $s = $acc['stats'];
	$app = ! empty( $c['app_url'] ) ? $c['app_url'] : 'https://colvy.com/admin';
	$tiles = array(
		array( 'Unread chats', isset( $s['unread'] ) ? $s['unread'] : null, 'chat', '#ff7a6b', $app . '/inbox' ),
		array( 'Open conversations', $s['open_chats'], 'inbox', '#6366f1', $app . '/inbox' ),
		array( 'Bookings · next 7 days', isset( $s['bookings_week'] ) ? $s['bookings_week'] : null, 'calendar', '#0ea5e9', $app . '/bookings' ),
		array( 'Waiting for stock', isset( $s['waitlist_waiting'] ) ? $s['waitlist_waiting'] : null, 'bell', '#f59e0b', $app . '/waitlists' ),
		array( 'Customers', isset( $s['contacts'] ) ? $s['contacts'] : null, 'users', '#10b981', $app . '/contacts' ),
		array( 'Ideas', $s['ideas'], 'bulb', '#a855f7', $c['board_url'] ),
	);
	$widget_on = colvywp_get( 'widget', 'on' ) !== 'off';
	$bis       = function_exists( 'colvy_bis_opts' ) ? colvy_bis_opts() : array( 'enabled' => 0 );
	?>
	<div class="cw-tiles">
		<?php $i = 0; foreach ( $tiles as $t ) : if ( $t[1] === null ) continue; ?>
		<a class="cw-tile" href="<?php echo esc_url( $t[4] ); ?>" target="_blank" rel="noopener" style="--c:<?php echo esc_attr( $t[3] ); ?>;animation-delay:<?php echo (int) ( $i++ * 40 ); ?>ms">
			<span class="cw-tile-ic"><?php echo colvywp_i( $t[2], 18 ); // phpcs:ignore ?></span>
			<span class="cw-tile-k"><?php echo esc_html( $t[0] ); ?></span>
			<span class="cw-tile-v"><?php echo esc_html( number_format_i18n( (int) $t[1] ) ); ?></span>
		</a>
		<?php endforeach; ?>
	</div>

	<h2 class="cw-h2">On your website</h2>
	<div class="cw-features">
		<div class="cw-card cw-feat">
			<div class="cw-feat-top"><span class="cw-feat-ic" style="--c:#ff7a6b"><?php echo colvywp_i( 'chat', 20 ); // phpcs:ignore ?></span>
				<form method="post" class="cw-switch-form"><?php wp_nonce_field( 'colvywp_widget', 'colvywp_widget_nonce' ); ?>
					<label class="cw-switch" title="Show the chat widget on every page"><input type="checkbox" name="widget" value="1" <?php checked( $widget_on ); ?> onchange="this.form.submit()"><span></span></label>
				</form>
			</div>
			<h3>Chat widget</h3>
			<p>Live chat on every page. Messages land in your Colvy inbox with SMS, email and social.</p>
			<div class="cw-feat-foot"><span class="cw-pill <?php echo $widget_on ? 'on' : ''; ?>"><?php echo $widget_on ? 'Live on your site' : 'Off'; ?></span></div>
		</div>
		<div class="cw-card cw-feat">
			<div class="cw-feat-top"><span class="cw-feat-ic" style="--c:#f59e0b"><?php echo colvywp_i( 'bell', 20 ); // phpcs:ignore ?></span></div>
			<h3>Back in stock</h3>
			<p>“Notify me” on sold-out products. Colvy texts them once when it's back — replies come to your inbox.</p>
			<div class="cw-feat-foot"><span class="cw-pill <?php echo ! empty( $bis['enabled'] ) ? 'on' : ''; ?>"><?php echo ! empty( $bis['enabled'] ) ? 'On' : 'Off'; ?></span><a href="<?php echo esc_url( admin_url( 'admin.php?page=colvy-back-in-stock' ) ); ?>">Set up</a></div>
		</div>
		<div class="cw-card cw-feat">
			<div class="cw-feat-top"><span class="cw-feat-ic" style="--c:#0ea5e9"><?php echo colvywp_i( 'calendar', 20 ); // phpcs:ignore ?></span></div>
			<h3>Online booking</h3>
			<?php if ( ! empty( $c['booking_url'] ) ) : ?>
				<p>Add your booking page to any page or post with <code>[colvy_booking]</code> — it grows to fit as people book.</p>
				<div class="cw-feat-foot"><button type="button" class="cw-copy" data-copy="[colvy_booking]"><?php echo colvywp_i( 'link', 14 ); // phpcs:ignore ?> Copy shortcode</button><a href="<?php echo esc_url( $c['booking_url'] ); ?>" target="_blank" rel="noopener">Open page</a></div>
			<?php else : ?>
				<p>Let customers book appointments and pay a deposit. Turn it on in Colvy → Bookings.</p>
				<div class="cw-feat-foot"><a href="<?php echo esc_url( $app . '/bookings' ); ?>" target="_blank" rel="noopener">Set up in Colvy</a></div>
			<?php endif; ?>
		</div>
	</div>

	<h2 class="cw-h2">Jump to</h2>
	<div class="cw-links">
		<?php foreach ( array(
			array( 'Inbox', '/inbox', 'inbox' ), array( 'Customers', '/contacts', 'users' ), array( 'Orders', '/orders', 'cart' ),
			array( 'Bookings', '/bookings', 'calendar' ), array( 'Waitlists', '/waitlists', 'bell' ), array( 'Reviews', '/reviews', 'star' ),
		) as $l ) : ?>
		<a href="<?php echo esc_url( $app . $l[1] ); ?>" target="_blank" rel="noopener"><?php echo colvywp_i( $l[2], 16 ); // phpcs:ignore ?><?php echo esc_html( $l[0] ); ?></a>
		<?php endforeach; ?>
	</div>
	<p class="cw-foot">Plan: <strong><?php echo esc_html( ucfirst( $c['plan'] ) ); ?></strong> · <?php echo esc_html( $c['slug'] ); ?>.colvy.com · Plugin <?php echo esc_html( COLVYWP_VERSION ); ?></p>
	</div>
	<?php
}

/* ───────────────────────────── Branding ───────────────────────────── */

function colvywp_page_branding() {
	if ( ! current_user_can( 'manage_options' ) ) return;
	$msg = null;
	if ( isset( $_POST['colvy_brand_nonce'] ) && wp_verify_nonce( sanitize_text_field( wp_unslash( $_POST['colvy_brand_nonce'] ) ), 'colvy_save_brand' ) ) {
		$r = colvywp_api( 'POST', '/api/plugin/settings', array(
			'name'             => isset( $_POST['name'] ) ? sanitize_text_field( wp_unslash( $_POST['name'] ) ) : '',
			'logo_url'         => isset( $_POST['logo_url'] ) ? esc_url_raw( wp_unslash( $_POST['logo_url'] ) ) : '',
			'favicon_url'      => isset( $_POST['favicon_url'] ) ? esc_url_raw( wp_unslash( $_POST['favicon_url'] ) ) : '',
			'accent_color'     => isset( $_POST['accent_color'] ) ? sanitize_hex_color( wp_unslash( $_POST['accent_color'] ) ) : '',
			'default_homepage' => isset( $_POST['default_homepage'] ) ? sanitize_key( $_POST['default_homepage'] ) : '',
		) );
		$msg = is_wp_error( $r ) ? array( 'warn', $r->get_error_message() ) : array( 'ok', 'Saved to Colvy.' );
		delete_transient( 'colvywp_account' );
	}
	echo '<div class="wrap cw">';
	$acc = colvywp_header( 'colvy-branding', 'How your business looks across Colvy — chat widget, feedback board, booking and upload pages.' );
	if ( $msg ) colvywp_notice( $msg[0], esc_html( $msg[1] ) );
	if ( ! $acc || is_wp_error( $acc ) ) { colvywp_notice( 'warn', 'Connect Colvy first, under <a href="' . esc_url( admin_url( 'admin.php?page=colvy-settings' ) ) . '">Connection</a>.' ); echo '</div>'; return; }
	$c = $acc['company'];
	?>
	<div class="cw-grid2">
		<form method="post" class="cw-card cw-form">
			<?php wp_nonce_field( 'colvy_save_brand', 'colvy_brand_nonce' ); ?>
			<div class="cw-field"><label for="cw-name">Business name</label><input id="cw-name" name="name" type="text" value="<?php echo esc_attr( $c['name'] ); ?>"></div>
			<?php foreach ( array( 'logo_url' => array( 'Logo', 'Square works best — at least 256 × 256.' ), 'favicon_url' => array( 'Favicon', 'The small icon in browser tabs.' ) ) as $k => $l ) : ?>
			<div class="cw-field">
				<label><?php echo esc_html( $l[0] ); ?></label>
				<div class="cw-media" data-target="<?php echo esc_attr( $k ); ?>">
					<span class="cw-media-prev"><?php if ( ! empty( $c[ $k ] ) ) : ?><img src="<?php echo esc_url( $c[ $k ] ); ?>" alt=""><?php else : ?><?php echo colvywp_i( 'palette', 18 ); // phpcs:ignore ?><?php endif; ?></span>
					<input type="url" name="<?php echo esc_attr( $k ); ?>" value="<?php echo esc_attr( $c[ $k ] ); ?>" placeholder="https://…">
					<button type="button" class="cw-btn cw-btn-ghost cw-pick">Choose</button>
				</div>
				<p class="cw-help"><?php echo esc_html( $l[1] ); ?></p>
			</div>
			<?php endforeach; ?>
			<div class="cw-field"><label for="cw-accent">Brand colour</label><input id="cw-accent" name="accent_color" type="text" class="cw-color" value="<?php echo esc_attr( $c['accent_color'] ?: '#ff7a6b' ); ?>" data-default-color="#ff7a6b"></div>
			<div class="cw-field"><label for="cw-home">Feedback board opens on</label>
				<select id="cw-home" name="default_homepage">
					<?php foreach ( array( 'ideas' => 'Ideas', 'roadmap' => 'Roadmap', 'announcements' => 'Announcements', 'help' => 'Help Centre' ) as $v => $l ) : ?>
					<option value="<?php echo esc_attr( $v ); ?>" <?php selected( $c['default_homepage'], $v ); ?>><?php echo esc_html( $l ); ?></option>
					<?php endforeach; ?>
				</select>
			</div>
			<button type="submit" class="cw-btn">Save to Colvy</button>
		</form>
		<div class="cw-card cw-preview" style="--c:<?php echo esc_attr( $c['accent_color'] ?: '#ff7a6b' ); ?>">
			<div class="cw-k">Preview</div>
			<div class="cw-pv-chat">
				<div class="cw-pv-head"><span class="cw-pv-logo"><?php if ( ! empty( $c['logo_url'] ) ) : ?><img src="<?php echo esc_url( $c['logo_url'] ); ?>" alt=""><?php endif; ?></span><div><b class="cw-pv-name"><?php echo esc_html( $c['name'] ); ?></b><small>Typically replies in minutes</small></div></div>
				<div class="cw-pv-msg">Hi! How can we help today?</div>
				<div class="cw-pv-msg me">Is the swordtail back in stock?</div>
			</div>
			<div class="cw-pv-bubble"><?php echo colvywp_i( 'chat', 22 ); // phpcs:ignore ?></div>
		</div>
	</div>
	</div>
	<?php
}

/* ───────────────────────────── Connection ───────────────────────────── */

function colvywp_page_connection() {
	if ( ! current_user_can( 'manage_options' ) ) return;
	$saved = false;
	if ( isset( $_POST['colvy_settings_nonce'] ) && wp_verify_nonce( sanitize_text_field( wp_unslash( $_POST['colvy_settings_nonce'] ) ), 'colvy_save_settings' ) ) {
		colvywp_set( array(
			'company_id' => isset( $_POST['company_id'] ) ? sanitize_text_field( wp_unslash( $_POST['company_id'] ) ) : '',
			'api_key'    => isset( $_POST['api_key'] ) ? sanitize_text_field( wp_unslash( $_POST['api_key'] ) ) : '',
			'slug_cache' => '',
		) );
		delete_transient( 'colvywp_account' ); delete_transient( 'colvy_bis_summary' ); delete_transient( 'colvywp_slug_fail' );
		$saved = true;
	}
	echo '<div class="wrap cw">';
	$acc = colvywp_header( 'colvy-settings', 'Link this site to your Colvy workspace.' );
	if ( colvywp_connected() ) {
		if ( $acc && ! is_wp_error( $acc ) ) colvywp_notice( 'ok', 'Connected to <strong>' . esc_html( $acc['company']['name'] ) . '</strong> · ' . esc_html( $acc['company']['slug'] ) . '.colvy.com' );
		else colvywp_notice( 'warn', 'Connection failed: ' . esc_html( is_wp_error( $acc ) ? $acc->get_error_message() : 'unknown error' ) );
	} elseif ( $saved ) {
		colvywp_notice( 'warn', 'Enter both values to connect.' );
	}
	$key = colvywp_get( 'api_key' );
	?>
	<form method="post" class="cw-card cw-form" style="max-width:640px">
		<?php wp_nonce_field( 'colvy_save_settings', 'colvy_settings_nonce' ); ?>
		<p class="cw-help" style="margin-top:0">Find these in Colvy under <strong>Settings → API → WordPress plugin</strong>.</p>
		<div class="cw-field"><label for="cw-cid">Company ID</label><input id="cw-cid" name="company_id" type="text" value="<?php echo esc_attr( colvywp_get( 'company_id' ) ); ?>" placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" autocomplete="off"></div>
		<div class="cw-field"><label for="cw-key">API key</label>
			<div class="cw-reveal"><input id="cw-key" name="api_key" type="password" value="<?php echo esc_attr( $key ); ?>" placeholder="colvy_…" autocomplete="off"><button type="button" class="cw-btn cw-btn-ghost" data-reveal="#cw-key">Show</button></div>
			<p class="cw-help">Keep it private — it lets this site update your Colvy branding and add people to waitlists.</p>
		</div>
		<button type="submit" class="cw-btn">Save &amp; connect</button>
	</form>
	</div>
	<?php
}

/* ───────────────────────────── Storefront ───────────────────────────── */

// Chat widget on every page (switch it off under Overview).
add_action( 'wp_footer', function () {
	if ( colvywp_get( 'widget', 'on' ) === 'off' || ! colvywp_connected() ) return;
	$slug = colvywp_get( 'slug_cache' );
	if ( ! $slug && ! get_transient( 'colvywp_slug_fail' ) ) {
		$a = colvywp_account();
		if ( is_wp_error( $a ) ) set_transient( 'colvywp_slug_fail', 1, HOUR_IN_SECONDS ); // don't call Colvy on every page view
		else $slug = isset( $a['company']['slug'] ) ? $a['company']['slug'] : '';
	}
	if ( $slug ) echo '<script src="' . esc_url( COLVY_API_BASE . '/widget.js' ) . '" data-slug="' . esc_attr( $slug ) . '" async></script>'; // phpcs:ignore
} );

// [colvy_booking] or [colvy_booking service="consult" height="720"]
add_shortcode( 'colvy_booking', function ( $atts ) {
	$atts = shortcode_atts( array( 'service' => '', 'height' => 720 ), $atts );
	$acc  = colvywp_account();
	if ( is_wp_error( $acc ) || empty( $acc['company']['booking_url'] ) ) return current_user_can( 'manage_options' ) ? '<p><em>Colvy: online booking isn’t set up yet.</em></p>' : '';
	$url = $acc['company']['booking_url'] . ( $atts['service'] ? '/' . rawurlencode( sanitize_title( $atts['service'] ) ) : '' );
	$id  = 'colvy-booking-' . wp_rand( 1000, 9999 );
	return '<iframe id="' . esc_attr( $id ) . '" src="' . esc_url( add_query_arg( 'embed', '1', $url ) ) . '" title="Book online" style="width:100%;min-height:' . (int) $atts['height'] . 'px;border:0;display:block" loading="lazy"></iframe>'
		. '<script>window.addEventListener("message",function(e){if(e.data&&e.data.type==="colvy-booking-height"){var f=document.getElementById(' . wp_json_encode( $id ) . ');if(f&&f.contentWindow===e.source)f.style.height=e.data.height+"px";}});</script>';
} );

// Settings link on the Plugins screen.
add_filter( 'plugin_action_links_' . plugin_basename( __FILE__ ), function ( $links ) {
	array_unshift( $links, '<a href="' . esc_url( admin_url( 'admin.php?page=colvy-dashboard' ) ) . '">Open</a>' );
	return $links;
} );

// HPOS-compatible (we never touch order storage).
add_action( 'before_woocommerce_init', function () {
	if ( class_exists( '\Automattic\WooCommerce\Utilities\FeaturesUtil' ) ) \Automattic\WooCommerce\Utilities\FeaturesUtil::declare_compatibility( 'custom_order_tables', __FILE__, true );
} );
