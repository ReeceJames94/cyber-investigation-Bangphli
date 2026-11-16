/**
 * Investigation Official Memo Report Generator
 */
window.CyberReports = (function() {
    function updatePreview() {
        const tpl = document.getElementById('repTemplate')?.value || 'bank';
        const caseNo = document.getElementById('repCaseNo')?.value || '......../2569';
        const date = document.getElementById('repDate')?.value || '.... ............ 2569';
        const victim = document.getElementById('repVictim')?.value || '....................';
        const target = document.getElementById('repTarget')?.value || '....................';
        const detail = document.getElementById('repDetail')?.value || 'ได้ทำการสืบสวนรวบรวมพยานหลักฐานทางอิเล็กทรอนิกส์ที่เกี่ยวข้องเรียบร้อยแล้ว';
        const user = window.CyberState.getCurrentUser();

        let subject = 'รายงานผลการสืบสวนเส้นทางการเงินและบัญชีธนาคาร';
        if (tpl === 'telco') subject = 'รายงานผลการสืบสวนข้อมูลหมายเลขโทรศัพท์และข้อมูลจราจรทางคอมพิวเตอร์';
        if (tpl === 'arrest') subject = 'รายงานผลการสืบสวนติดตามจับกุมผู้ต้องหาตามหมายจับ';

        const text = `บันทึกข้อความ
ส่วนราชการ  งานสืบสวน สถานีตำรวจภูธรบางพลี
ที่  ตช 0016.(สม)4(สส.)/........          วันที่  ${date}
เรื่อง  ${subject} (คดีอาญาที่ ${caseNo})

เรียน  ผู้กำกับการสถานีตำรวจภูธรบางพลี (ผ่าน พนักงานสอบสวนผู้รับผิดชอบ)

          ตามที่ ${victim} ผู้เสียหาย ได้มาแจ้งความร้องทุกข์ต่อพนักงานสอบสวน สภ.บางพลี ตามคดีอาญาที่ ${caseNo} นั้น
          บัดนี้ เจ้าหน้าที่ตำรวจชุดสืบสวน สภ.บางพลี ได้ทำการสืบสวนตรวจสอบข้อมูลเป้าหมาย ได้แก่ ${target} ปรากฏรายละเอียดผลการสืบสวนดังนี้
          ${detail}

          จึงเรียนมาเพื่อโปรดพิจารณาประกอบสำนวนการสอบสวนต่อไป

                                        (ลงชื่อ)....................................................
                                                 ( ${user ? user.name : 'เจ้าหน้าที่ชุดสืบสวน'} )
                                                   ตำแหน่ง เจ้าพนักงานตำรวจชุดสืบสวน สภ.บางพลี`;

        const box = document.getElementById('repOutputBox');
        if (box) box.value = text;
    }

    function copyText() {
        const box = document.getElementById('repOutputBox');
        if (!box) return;
        box.select();
        document.execCommand('copy');
        window.CyberUI.showToast('คัดลอกร่างรายงานการสืบสวนลงคลิปบอร์ดแล้ว', 'success');
    }

    return {
        updatePreview,
        copyText
    };
})();
