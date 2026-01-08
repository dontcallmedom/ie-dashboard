function showFilterNotice(filterLabel, insertPoint) {
  const filterMsg = document.createElement('div');
  filterMsg.className = "notice";
  filterMsg.innerHTML = `<strong>${filterLabel}</strong> <a href="?" class=clear>(Clear Filter)</a>`;
  insertPoint.parentElement.after(filterMsg);
}
