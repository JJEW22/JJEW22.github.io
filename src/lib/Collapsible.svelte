<script>
    export let title = 'Click to expand';
    export let open = false;
    export let animated = true;
    export let iconType = 'plus'; // 'plus', 'chevron', 'arrow', or 'none'
    export let variant = 'default'; // 'default', 'bordered', 'filled', 'minimal', 'custom'
    
    // Typography customization
    export let titleSize = '1rem';
    export let titleWeight = '500';
    export let titleFont = 'inherit';
    export let titleColor = null; // null uses default based on variant
    
    // Header customization
    export let headerBg = null; // null uses default based on variant
    export let headerBgHover = null;
    export let headerPadding = '0.75rem 1rem';
    export let headerBorderRadius = '6px';
    export let transparent = false;
    
    // Content customization
    export let contentBg = null;
    export let contentPadding = '1rem';
    export let contentColor = null;
    
    // Icon customization
    export let iconColor = null;
    export let iconSize = '1.25rem';
    
    // Border customization
    export let borderColor = '#ddd';
    export let borderWidth = '1px';
    export let borderStyle = 'solid';
    export let showBorder = false; // for custom variant
    
    function toggle() {
        open = !open;
    }
    
    // Get icon based on type
    function getIcon(type, isOpen) {
        switch(type) {
            case 'plus':
                return isOpen ? '−' : '+';
            case 'chevron':
                return '›';
            case 'arrow':
                return '▼';
            default:
                return '';
        }
    }
    
    // Build custom styles
    $: headerStyles = [
        titleSize && `font-size: ${titleSize}`,
        titleWeight && `font-weight: ${titleWeight}`,
        titleFont && `font-family: ${titleFont}`,
        titleColor && `color: ${titleColor}`,
        headerBg && `background: ${headerBg}`,
        headerPadding && `padding: ${headerPadding}`,
        transparent && 'background: transparent',
        variant === 'custom' && headerBorderRadius && `border-radius: ${headerBorderRadius}`
    ].filter(Boolean).join('; ');
    
    $: contentStyles = [
        contentBg && `background: ${contentBg}`,
        contentPadding && `padding: ${contentPadding}`,
        contentColor && `color: ${contentColor}`
    ].filter(Boolean).join('; ');
    
    $: iconStyles = [
        iconColor && `color: ${iconColor}`,
        iconSize && `font-size: ${iconSize}`
    ].filter(Boolean).join('; ');
    
    $: containerStyles = variant === 'custom' && showBorder ? 
        `border: ${borderWidth} ${borderStyle} ${borderColor}; border-radius: ${headerBorderRadius}` : '';
    
    $: headerHoverStyles = headerBgHover ? `background: ${headerBgHover} !important` : '';
</script>

<div 
    class="collapsible {variant}" 
    class:open
    class:transparent
    style={containerStyles}
>
    <button 
        class="header"
        class:custom-header={variant === 'custom'}
        on:click={toggle}
        aria-expanded={open}
        type="button"
        style={headerStyles}
        on:mouseenter={(e) => headerBgHover && (e.target.style.background = headerBgHover)}
        on:mouseleave={(e) => headerBgHover && (e.target.style.background = headerBg || '')}
    >
        <span class="title">{title}</span>
        {#if iconType !== 'none'}
            <span 
                class="icon {iconType}" 
                class:rotated={open}
                style={iconStyles}
            >
                {getIcon(iconType, open)}
            </span>
        {/if}
    </button>
    
    {#if animated}
        <div class="content-wrapper" class:expanded={open}>
            <div class="content" style={contentStyles}>
                <slot />
            </div>
        </div>
    {:else if open}
        <div class="content" style={contentStyles}>
            <slot />
        </div>
    {/if}
</div>

<style>
    .collapsible {
        margin-bottom: 0.5rem;
        overflow: hidden;
    }
    
    .collapsible.custom {
        overflow: visible;
    }
    
    .header {
        width: 100%;
        border: none;
        cursor: pointer;
        display: flex;
        justify-content: space-between;
        align-items: center;
        text-align: left;
        transition: all 0.2s;
        font-family: inherit;
        /* Default styles that can be overridden */
        padding: 0.75rem 1rem;
        background: transparent;
        font-size: 1rem;
    }
    
    .header.custom-header:hover {
        /* Custom variant hover handled by JavaScript */
    }
    
    .title {
        /* Title inherits all font properties from header */
    }
    
    .icon {
        transition: transform 0.3s ease;
        /* Default icon styles */
        font-size: 1.25rem;
        color: #666;
    }
    
    .icon.chevron {
        display: inline-block;
    }
    
    .icon.chevron.rotated {
        transform: rotate(90deg);
    }
    
    .icon.arrow.rotated {
        transform: rotate(180deg);
    }
    
    /* Content styles */
    .content {
        /* Default content styles */
        padding: 1rem;
    }
    
    /* Animated wrapper */
    .content-wrapper {
        max-height: 0;
        overflow: hidden;
        transition: max-height 0.3s ease-out;
    }
    
    .content-wrapper.expanded {
        max-height: 2000px; /* Adjust based on your needs */
        transition: max-height 0.3s ease-in;
    }
    
    /* Variant: Default */
    .default:not(.transparent) .header {
        background: #f5f5f5;
        border-radius: 6px;
    }
    
    .default .header:hover {
        background: #e8e8e8;
    }
    
    .default.open:not(.transparent) .header {
        border-bottom-left-radius: 0;
        border-bottom-right-radius: 0;
    }
    
    .default:not(.transparent) .content {
        background: #fafafa;
        border-bottom-left-radius: 6px;
        border-bottom-right-radius: 6px;
    }
    
    /* Variant: Bordered */
    .bordered {
        border: 1px solid #ddd;
        border-radius: 6px;
    }
    
    .bordered:not(.transparent) .header {
        background: white;
    }
    
    .bordered .header:hover {
        background: #f5f5f5;
    }
    
    .bordered .content {
        background: white;
        border-top: 1px solid #eee;
    }
    
    /* Variant: Filled */
    .filled:not(.transparent) .header {
        background: #0066cc;
        color: white;
        border-radius: 6px;
    }
    
    .filled .header:hover {
        background: #0052a3;
    }
    
    .filled .icon {
        color: white;
    }
    
    .filled.open .header {
        border-bottom-left-radius: 0;
        border-bottom-right-radius: 0;
    }
    
    .filled:not(.transparent) .content {
        background: #f0f7ff;
        border: 1px solid #0066cc;
        border-top: none;
        border-bottom-left-radius: 6px;
        border-bottom-right-radius: 6px;
    }
    
    /* Variant: Minimal */
    .minimal .header {
        padding-left: 0;
        padding-right: 0;
        border-bottom: 1px solid transparent;
    }
    
    .minimal .header:hover {
        border-bottom-color: #ddd;
    }
    
    .minimal.open .header {
        border-bottom-color: #0066cc;
    }
    
    .minimal .content {
        padding-left: 0;
        padding-right: 0;
    }
    
    /* Transparent modifier */
    .transparent .header {
        background: transparent !important;
    }
    
    .transparent .content {
        background: transparent !important;
    }
</style>