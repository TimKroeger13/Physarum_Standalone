async function ShowLoadingMessage (CurNum, MaxNum){

    const titleElement = document.getElementById('titelMeassage');
    const titleClass = document.querySelector('.Titel');

    titleElement.textContent = (CurNum+1) + " / " + MaxNum;

    titleElement.style.fontSize = '1em';

    titleClass.style.backgroundColor = 'red'; 

}

async function RestoreTitel (){
    const titleClass = document.querySelector('.Titel');
    const titleElement = document.getElementById('titelMeassage');

    titleClass.style.backgroundColor = 'white'; 
    titleElement.textContent = 'Gewichteter Physarum polycephalum Netzplaner [Prototyp]'
}