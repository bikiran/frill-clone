/* Colvy admin pages: media picker, colour picker, copy + reveal buttons. */
jQuery(function ($) {
  // Logo / favicon → WordPress Media Library.
  $(document).on('click', '.cw-pick', function (e) {
    e.preventDefault();
    var box = $(this).closest('.cw-media');
    if (!window.wp || !wp.media) return;
    var frame = wp.media({ title: 'Choose an image', button: { text: 'Use this image' }, library: { type: 'image' }, multiple: false });
    frame.on('select', function () {
      var a = frame.state().get('selection').first().toJSON();
      box.find('input[type=url]').val(a.url).trigger('change');
    });
    frame.open();
  });
  $(document).on('change input', '.cw-media input[type=url]', function () {
    var v = $(this).val(), prev = $(this).closest('.cw-media').find('.cw-media-prev');
    if (/^https?:\/\//.test(v)) prev.html($('<img alt="">').attr('src', v));
    if ($(this).attr('name') === 'logo_url') $('.cw-pv-logo').html(/^https?:\/\//.test(v) ? $('<img alt="">').attr('src', v) : '');
  });

  // Brand colour → live preview.
  if ($.fn.wpColorPicker) {
    $('.cw-color').wpColorPicker({ change: function (e, ui) { $('.cw-preview').css('--c', ui.color.toString()); } });
  }
  $(document).on('input', '#cw-name', function () { $('.cw-pv-name').text($(this).val()); });

  // Copy shortcode.
  $(document).on('click', '.cw-copy', function () {
    var b = $(this), t = b.data('copy');
    (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(function () {
      var o = b.html(); b.addClass('done').text('Copied'); setTimeout(function () { b.removeClass('done').html(o); }, 1400);
    }).catch(function () { window.prompt('Copy this:', t); });
  });

  // Show / hide API key.
  $(document).on('click', '[data-reveal]', function () {
    var i = $($(this).data('reveal')), show = i.attr('type') === 'password';
    i.attr('type', show ? 'text' : 'password'); $(this).text(show ? 'Hide' : 'Show');
  });
});
