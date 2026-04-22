async function navigateTo(pageName) {
    const response = await fetch(`/pages/${pageName}`);
    const data     = await response.json();
}
