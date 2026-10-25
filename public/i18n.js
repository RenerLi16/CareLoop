// Interface copy only; care data and parsed values remain in their original language.
const interfaceCopy = new Map([
  ["Language", ["Ngôn ngữ", "Idioma", "语言", "언어"]],
  [
    "Interface language",
    ["Ngôn ngữ giao diện", "Idioma de la interfaz", "界面语言", "화면 언어"],
  ],
  ["Today", ["Hôm nay", "Hoy", "今天", "오늘"]],
  [
    "Read Discharge",
    ["Đọc hướng dẫn xuất viện", "Leer el alta", "出院说明", "퇴원 안내"],
  ],
  [
    "Daily Schedule",
    ["Lịch hằng ngày", "Horario diario", "每日安排", "일일 일정"],
  ],
  [
    "Daily schedule",
    ["Lịch hằng ngày", "Horario diario", "每日安排", "일일 일정"],
  ],
  [
    "30-Day Plan",
    ["Kế hoạch 30 ngày", "Plan de 30 días", "30天计划", "30일 계획"],
  ],
  [
    "30-day plan",
    ["Kế hoạch 30 ngày", "Plan de 30 días", "30天计划", "30일 계획"],
  ],
  ["Care Team", ["Nhóm chăm sóc", "Equipo de cuidado", "照护团队", "돌봄 팀"]],
  ["About", ["Giới thiệu", "Acerca de", "关于", "소개"]],
  [
    "DISCHARGE → ROUTINE COMPILER",
    [
      "XUẤT VIỆN → LỊCH CHĂM SÓC",
      "DEL ALTA A LA RUTINA",
      "出院 → 日常照护",
      "퇴원 → 일상 돌봄",
    ],
  ],
  [
    "No plan loaded. Start with Read Discharge.",
    [
      "Chưa có kế hoạch. Bắt đầu ở Đọc hướng dẫn xuất viện.",
      "No hay un plan. Empiece en Leer el alta.",
      "尚未载入计划。请先打开出院说明。",
      "계획이 없습니다. 퇴원 안내에서 시작하세요.",
    ],
  ],
  [
    "No plan loaded yet.",
    [
      "Chưa có kế hoạch.",
      "Todavía no hay un plan.",
      "尚未载入计划。",
      "아직 계획이 없습니다.",
    ],
  ],
  ["Next up", ["Việc tiếp theo", "A continuación", "下一项", "다음 할 일"]],
  [
    "Mark done",
    ["Ghi nhận đã xong", "Marcar como hecho", "记录完成", "완료 기록"],
  ],
  ["Skip", ["Bỏ qua", "Omitir", "跳过", "건너뛰기"]],
  [
    "Read discharge instructions",
    [
      "Đọc hướng dẫn xuất viện",
      "Leer instrucciones del alta",
      "阅读出院说明",
      "퇴원 안내 읽기",
    ],
  ],
  [
    "Discharge text",
    ["Nội dung xuất viện", "Texto del alta", "出院说明原文", "퇴원 안내 원문"],
  ],
  [
    "Paste the discharge summary…",
    [
      "Dán bản tóm tắt xuất viện…",
      "Pegue el resumen del alta…",
      "粘贴出院小结…",
      "퇴원 요약을 붙여 넣으세요…",
    ],
  ],
  ["Load sample", ["Tải ví dụ", "Cargar ejemplo", "载入示例", "예시 불러오기"]],
  ["Read it", ["Đọc nội dung", "Leer texto", "读取内容", "내용 읽기"]],
  [
    "Enter manually",
    ["Nhập thủ công", "Introducir a mano", "手动输入", "직접 입력"],
  ],
  [
    "Reopen saved plan",
    [
      "Mở lại kế hoạch đã lưu",
      "Reabrir plan guardado",
      "重新打开已保存计划",
      "저장된 계획 다시 열기",
    ],
  ],
  [
    "Check what was read",
    [
      "Kiểm tra nội dung đã đọc",
      "Revise lo leído",
      "核对读取结果",
      "읽은 내용 확인",
    ],
  ],
  ["Name", ["Tên", "Nombre", "姓名", "이름"]],
  ["Age", ["Tuổi", "Edad", "年龄", "나이"]],
  ["Discharge date", ["Ngày xuất viện", "Fecha de alta", "出院日期", "퇴원일"]],
  [
    "Patient language",
    ["Ngôn ngữ bệnh nhân", "Idioma del paciente", "患者语言", "환자 언어"],
  ],
  [
    "Medications and timing rules",
    [
      "Thuốc và quy tắc thời gian",
      "Medicamentos y reglas de horario",
      "药物及时间规则",
      "약과 복용 시간 규칙",
    ],
  ],
  ["Drug", ["Thuốc", "Medicamento", "药物", "약"]],
  ["Dose", ["Liều", "Dosis", "剂量", "용량"]],
  ["How often", ["Tần suất", "Frecuencia", "频次", "복용 빈도"]],
  ["Meal", ["Bữa ăn", "Comida", "进餐", "식사"]],
  [
    "Separate from",
    ["Cách xa thuốc", "Separar de", "需间隔的药物", "간격을 둘 약"],
  ],
  [
    "Gap (h)",
    ["Khoảng cách (giờ)", "Intervalo (h)", "间隔（小时）", "간격(시간)"],
  ],
  [
    "+ Add medication",
    ["+ Thêm thuốc", "+ Añadir medicamento", "+ 添加药物", "+ 약 추가"],
  ],
  ["Meal times", ["Giờ ăn", "Horas de comida", "用餐时间", "식사 시간"]],
  ["Breakfast", ["Bữa sáng", "Desayuno", "早餐", "아침"]],
  ["Lunch", ["Bữa trưa", "Almuerzo", "午餐", "점심"]],
  ["Dinner", ["Bữa tối", "Cena", "晚餐", "저녁"]],
  ["Follow-up", ["Tái khám", "Seguimiento", "复诊", "후속 진료"]],
  ["Who", ["Chuyên khoa", "Profesional", "就诊对象", "진료 대상"]],
  [
    "Within (days)",
    ["Trong (ngày)", "Dentro de (días)", "期限（天）", "기한(일)"],
  ],
  [
    "+ Add follow-up",
    [
      "+ Thêm tái khám",
      "+ Añadir seguimiento",
      "+ 添加复诊",
      "+ 후속 진료 추가",
    ],
  ],
  ["Monitoring", ["Theo dõi", "Seguimiento diario", "监测", "관찰"]],
  [
    "Morning weight, every day",
    [
      "Cân buổi sáng, mỗi ngày",
      "Peso cada mañana",
      "每日晨起称重",
      "매일 아침 체중",
    ],
  ],
  [
    "Daily symptom check",
    [
      "Kiểm tra triệu chứng hằng ngày",
      "Revisión diaria de síntomas",
      "每日症状检查",
      "매일 증상 확인",
    ],
  ],
  [
    "Red flags",
    ["Dấu hiệu cảnh báo", "Señales de alarma", "警示症状", "주의 증상"],
  ],
  [
    "Clinician warning instructions",
    [
      "Hướng dẫn cảnh báo của bác sĩ",
      "Indicaciones de alarma del profesional",
      "医护人员的警示说明",
      "의료진의 주의 사항",
    ],
  ],
  [
    "Instructions from the discharge sheet",
    [
      "Hướng dẫn trên giấy xuất viện",
      "Indicaciones de la hoja de alta",
      "出院单上的说明",
      "퇴원 안내서의 지침",
    ],
  ],
  [
    "Compile schedule",
    ["Lập lịch", "Crear horario", "生成安排", "일정 만들기"],
  ],
  [
    "Compile a plan first.",
    [
      "Hãy lập kế hoạch trước.",
      "Primero cree un plan.",
      "请先生成计划。",
      "먼저 계획을 만드세요.",
    ],
  ],
  [
    "Show all days",
    [
      "Hiện tất cả các ngày",
      "Mostrar todos los días",
      "显示所有日期",
      "모든 날짜 보기",
    ],
  ],
  [
    "Care team load",
    [
      "Phân công chăm sóc",
      "Carga del equipo de cuidado",
      "照护任务分配",
      "돌봄 팀의 업무",
    ],
  ],
  [
    "Assignments and their completion.",
    [
      "Phân công và tiến độ hoàn thành.",
      "Asignaciones y tareas completadas.",
      "任务分配及完成情况。",
      "업무 배정과 완료 현황입니다.",
    ],
  ],
  [
    "Edit caregivers",
    [
      "Sửa người chăm sóc",
      "Editar cuidadores",
      "编辑照护者",
      "돌봄 담당자 수정",
    ],
  ],
  ["Relationship", ["Quan hệ", "Parentesco", "关系", "관계"]],
  [
    "Add caregiver",
    [
      "Thêm người chăm sóc",
      "Añadir cuidador",
      "添加照护者",
      "돌봄 담당자 추가",
    ],
  ],
  ["Save", ["Lưu", "Guardar", "保存", "저장"]],
  ["Remove", ["Xóa", "Quitar", "移除", "삭제"]],
  [
    "About CareLoop",
    ["Về CareLoop", "Acerca de CareLoop", "关于 CareLoop", "CareLoop 소개"],
  ],
  ["What it does", ["Chức năng", "Qué hace", "功能说明", "주요 기능"]],
  [
    "Why not just ask a chatbot",
    [
      "Vì sao không chỉ hỏi chatbot",
      "Por qué no usar solo un chatbot",
      "为什么不只询问聊天机器人",
      "챗봇만으로 부족한 이유",
    ],
  ],
  [
    "Hold state across days",
    [
      "Lưu trạng thái qua nhiều ngày",
      "Conservar datos entre días",
      "保留跨日状态",
      "날짜가 바뀌어도 기록 유지",
    ],
  ],
  [
    "Solve, not summarise",
    [
      "Giải quyết thay vì tóm tắt",
      "Resolver, no solo resumir",
      "求解而非总结",
      "요약을 넘어 일정 계산",
    ],
  ],
  [
    "Notice a violation afterwards",
    [
      "Phát hiện sai lệch sau đó",
      "Detectar incumplimientos después",
      "事后发现规则偏差",
      "기록 후 규칙 위반 확인",
    ],
  ],
  [
    "Keep the family’s record",
    [
      "Giữ hồ sơ gia đình",
      "Conservar el registro familiar",
      "保留家庭照护记录",
      "가족의 돌봄 기록 보관",
    ],
  ],
  ["What it is not", ["Giới hạn", "Qué no es", "功能边界", "서비스의 한계"]],
  [
    "Privacy and offline design",
    [
      "Riêng tư và ngoại tuyến",
      "Privacidad y uso sin conexión",
      "隐私与离线使用",
      "개인정보와 오프라인 사용",
    ],
  ],
  ["Built with", ["Công nghệ", "Tecnología", "使用技术", "사용 기술"]],
  [
    "Data and demo controls",
    [
      "Dữ liệu và công cụ ví dụ",
      "Datos y controles de ejemplo",
      "数据及演示操作",
      "데이터 및 예시 관리",
    ],
  ],
  [
    "Reload sample family",
    [
      "Tải lại gia đình ví dụ",
      "Recargar familia de ejemplo",
      "重新载入示例家庭",
      "예시 가족 다시 불러오기",
    ],
  ],
  [
    "Save encrypted backup",
    [
      "Lưu bản sao mã hóa",
      "Guardar copia cifrada",
      "保存加密备份",
      "암호화 백업 저장",
    ],
  ],
  [
    "Restore backup",
    ["Khôi phục bản sao", "Restaurar copia", "恢复备份", "백업 복원"],
  ],
  [
    "Delete care record",
    [
      "Xóa hồ sơ chăm sóc",
      "Eliminar registro de cuidado",
      "删除照护记录",
      "돌봄 기록 삭제",
    ],
  ],
  ["Adherence", ["Mức hoàn thành", "Cumplimiento", "完成率", "완료율"]],
  [
    "Rule breaks",
    ["Sai lệch quy tắc", "Incumplimientos", "规则偏差", "규칙 위반"],
  ],
  ["Past due", ["Quá giờ", "Atrasadas", "已逾时", "예정 시간 지남"]],
  ["Done", ["Đã xong", "Hecho", "已完成", "완료"]],
  ["Time", ["Giờ", "Hora", "时间", "시간"]],
  ["Task", ["Việc", "Tarea", "任务", "할 일"]],
  ["Assigned", ["Phân công", "Asignado", "负责人", "담당자"]],
  ["Status", ["Trạng thái", "Estado", "状态", "상태"]],
  ["Action", ["Thao tác", "Acción", "操作", "작업"]],
  ["Record", ["Ghi nhận", "Registrar", "记录", "기록"]],
  ["Edit record", ["Sửa ghi nhận", "Editar registro", "修改记录", "기록 수정"]],
  ["Unassigned", ["Chưa phân công", "Sin asignar", "未分配", "미배정"]],
  ["Caregiver", ["Người chăm sóc", "Cuidador", "照护者", "돌봄 담당자"]],
  ["Load", ["Khối lượng", "Carga", "任务量", "업무량"]],
  ["Tasks", ["Công việc", "Tareas", "任务", "할 일"]],
  ["Rate", ["Tỷ lệ", "Tasa", "比例", "비율"]],
  ["Active days", ["Ngày tham gia", "Días activos", "参与天数", "활동 일수"]],
  ["Spacing", ["Khoảng cách", "Separación", "间隔", "간격"]],
  [
    "Compiled time",
    ["Giờ đã lập", "Hora calculada", "生成的时间", "계산된 시간"],
  ],
  [
    "Rules the compiler had to honour",
    [
      "Các quy tắc được áp dụng",
      "Reglas que se han respetado",
      "安排所遵循的规则",
      "일정에 적용된 규칙",
    ],
  ],
  [
    "Automatically resolved",
    [
      "Đã tự điều chỉnh",
      "Ajustado automáticamente",
      "已自动调整",
      "자동 조정됨",
    ],
  ],
  [
    "Auto-resolve schedule",
    ["Tự điều chỉnh lịch", "Ajustar horario", "自动调整安排", "일정 자동 조정"],
  ],
  [
    "Try a conflict example",
    [
      "Thử ví dụ xung đột",
      "Probar un conflicto de ejemplo",
      "尝试冲突示例",
      "충돌 예시 보기",
    ],
  ],
  [
    "Supported rules satisfied.",
    [
      "Đáp ứng các quy tắc được hỗ trợ.",
      "Se cumplen las reglas compatibles.",
      "已满足支持的规则。",
      "지원되는 규칙을 충족합니다.",
    ],
  ],
  [
    "No timing alerts in the recorded doses.",
    [
      "Không có cảnh báo thời gian trong ghi nhận.",
      "Sin alertas de horario en las dosis registradas.",
      "已记录的用药无时间警报。",
      "기록된 복용 시간에 알림이 없습니다.",
    ],
  ],
  [
    "Schedule cannot satisfy the rules",
    [
      "Lịch không đáp ứng các quy tắc",
      "El horario no cumple las reglas",
      "安排无法满足规则",
      "일정이 규칙을 충족하지 못함",
    ],
  ],
  [
    "Record breaks a timing rule",
    [
      "Ghi nhận sai quy tắc thời gian",
      "El registro incumple una regla de horario",
      "记录不符合时间规则",
      "기록이 시간 규칙을 위반함",
    ],
  ],
  [
    "Dose still open",
    ["Chưa ghi nhận liều", "Dosis pendiente", "用药尚未记录", "복용 기록 대기"],
  ],
  [
    "From the discharge instructions",
    [
      "Từ hướng dẫn xuất viện",
      "De las instrucciones del alta",
      "来自出院说明",
      "퇴원 안내의 지침",
    ],
  ],
  [
    "Log matches the rules.",
    [
      "Ghi nhận phù hợp quy tắc.",
      "El registro cumple las reglas.",
      "记录符合规则。",
      "기록이 규칙과 일치합니다.",
    ],
  ],
  [
    "No dose was logged too close to another.",
    [
      "Không có liều nào được ghi quá sát liều khác.",
      "No hay dosis registradas demasiado próximas.",
      "没有用药记录的间隔过短。",
      "간격이 너무 짧게 기록된 복용이 없습니다.",
    ],
  ],
  [
    "Rule break in the record",
    [
      "Sai lệch quy tắc trong ghi nhận",
      "Incumplimiento en el registro",
      "记录中的规则偏差",
      "기록 내 규칙 위반",
    ],
  ],
  ["Completed", ["Đã hoàn thành", "Completado", "已完成", "완료"]],
  ["Skipped", ["Đã bỏ qua", "Omitido", "已跳过", "건너뜀"]],
  ["Pending", ["Đang chờ", "Pendiente", "待完成", "대기"]],
  ["done", ["đã xong", "hecho", "已完成", "완료"]],
  ["todo", ["chờ làm", "pendiente", "待完成", "대기"]],
  ["skip", ["bỏ qua", "omitido", "已跳过", "건너뜀"]],
  [
    "Recorded by",
    ["Người ghi nhận", "Registrado por", "记录人", "기록한 사람"],
  ],
  ["Choose a name", ["Chọn tên", "Elija un nombre", "选择姓名", "이름 선택"]],
  [
    "Actual time (device time)",
    [
      "Giờ thực tế (giờ thiết bị)",
      "Hora real (del dispositivo)",
      "实际时间（设备时间）",
      "실제 시간(기기 시간)",
    ],
  ],
  [
    "Repeated clock time",
    [
      "Giờ trùng khi đổi giờ",
      "Hora repetida del reloj",
      "时钟重复时间",
      "시계에 반복된 시간",
    ],
  ],
  [
    "Note (optional)",
    [
      "Ghi chú (không bắt buộc)",
      "Nota (opcional)",
      "备注（可选）",
      "메모(선택)",
    ],
  ],
  [
    "Reason for correction",
    ["Lý do sửa", "Motivo de la corrección", "修改原因", "수정 이유"],
  ],
  [
    "Save record",
    ["Lưu ghi nhận", "Guardar registro", "保存记录", "기록 저장"],
  ],
  ["Cancel", ["Hủy", "Cancelar", "取消", "취소"]],
  [
    "Start with a discharge summary",
    [
      "Bắt đầu với tóm tắt xuất viện",
      "Empiece con un resumen del alta",
      "从出院小结开始",
      "퇴원 요약으로 시작하세요",
    ],
  ],
  ["Read", ["Đọc", "Leer", "读取", "읽기"]],
  ["Review", ["Kiểm tra", "Revisar", "核对", "확인"]],
  ["Compile", ["Lập lịch", "Crear", "生成", "생성"]],
  [
    "Keep the record",
    ["Ghi lại chăm sóc", "Mantener el registro", "保留记录", "돌봄 기록 유지"],
  ],
  [
    "Load sample family",
    [
      "Tải gia đình ví dụ",
      "Cargar familia de ejemplo",
      "载入示例家庭",
      "예시 가족 불러오기",
    ],
  ],
  [
    "Read a summary",
    ["Đọc tóm tắt", "Leer un resumen", "读取小结", "요약 읽기"],
  ],
  [
    "Not read:",
    ["Chưa đọc được:", "No se ha leído:", "未能读取：", "읽지 못한 내용:"],
  ],
  [
    "I entered these instructions manually below.",
    [
      "Tôi đã nhập các hướng dẫn này bên dưới.",
      "He introducido estas indicaciones a mano abajo.",
      "我已在下方手动输入这些说明。",
      "아래에 이 지침을 직접 입력했습니다.",
    ],
  ],
  ["Reviewed", ["Đã kiểm tra", "Revisado", "已核对", "확인함"]],
  [
    "Choose frequency",
    ["Chọn tần suất", "Elegir frecuencia", "选择频次", "빈도 선택"],
  ],
  [
    "All other medicines",
    [
      "Tất cả thuốc khác",
      "Todos los demás medicamentos",
      "所有其他药物",
      "다른 모든 약",
    ],
  ],
  ["Remove row", ["Xóa dòng", "Quitar fila", "删除此行", "행 삭제"]],
  [
    "once daily",
    ["mỗi ngày một lần", "una vez al día", "每日一次", "하루 한 번"],
  ],
  [
    "twice daily",
    ["mỗi ngày hai lần", "dos veces al día", "每日两次", "하루 두 번"],
  ],
  [
    "three times daily",
    ["mỗi ngày ba lần", "tres veces al día", "每日三次", "하루 세 번"],
  ],
  ["every 6 hours", ["mỗi 6 giờ", "cada 6 horas", "每6小时", "6시간마다"]],
  ["every 8 hours", ["mỗi 8 giờ", "cada 8 horas", "每8小时", "8시간마다"]],
  ["every 12 hours", ["mỗi 12 giờ", "cada 12 horas", "每12小时", "12시간마다"]],
  ["at bedtime", ["trước khi ngủ", "al acostarse", "睡前", "취침 시"]],
  ["in the morning", ["buổi sáng", "por la mañana", "早晨", "아침에"]],
  ["with food", ["cùng thức ăn", "con comida", "随餐", "음식과 함께"]],
  ["before food", ["trước bữa ăn", "antes de comer", "餐前", "식전"]],
  ["after food", ["sau bữa ăn", "después de comer", "餐后", "식후"]],
  ["Patient", ["Bệnh nhân", "Paciente", "患者", "환자"]],
  ["No plan", ["Chưa có kế hoạch", "Sin plan", "暂无计划", "계획 없음"]],
  ["Recorded", ["Đã ghi", "Registrado", "已记录", "기록됨"]],
  ["Caregivers", ["Người chăm sóc", "Cuidadores", "照护者", "돌봄 담당자"]],
  [
    "Passphrase (at least 12 characters)",
    [
      "Mật khẩu (ít nhất 12 ký tự)",
      "Frase de contraseña (al menos 12 caracteres)",
      "密码短语（至少12个字符）",
      "암호문(12자 이상)",
    ],
  ],
  [
    "Repeat passphrase",
    [
      "Nhập lại mật khẩu",
      "Repita la frase",
      "重复密码短语",
      "암호문 다시 입력",
    ],
  ],
  [
    "Keep the passphrase. CareLoop cannot recover it.",
    [
      "Giữ mật khẩu. CareLoop không thể khôi phục mật khẩu.",
      "Guarde la frase. CareLoop no puede recuperarla.",
      "请妥善保存密码短语，CareLoop 无法找回。",
      "암호문을 보관하세요. CareLoop에서 복구할 수 없습니다.",
    ],
  ],
  [
    "Encrypt and download",
    [
      "Mã hóa và tải xuống",
      "Cifrar y descargar",
      "加密并下载",
      "암호화하여 다운로드",
    ],
  ],
  [
    "Unlock backup",
    ["Mở khóa bản sao", "Desbloquear copia", "解锁备份", "백업 잠금 해제"],
  ],
  [
    "Backup passphrase",
    ["Mật khẩu bản sao", "Frase de la copia", "备份密码短语", "백업 암호문"],
  ],
  [
    "Unlock and review",
    [
      "Mở khóa và kiểm tra",
      "Desbloquear y revisar",
      "解锁并核对",
      "잠금 해제 후 확인",
    ],
  ],
  [
    "Delete this care record?",
    [
      "Xóa hồ sơ chăm sóc này?",
      "¿Eliminar este registro de cuidado?",
      "删除此照护记录？",
      "이 돌봄 기록을 삭제할까요?",
    ],
  ],
  [
    "Deletes the plan and records in this browser. Downloaded backups remain.",
    [
      "Xóa kế hoạch và ghi nhận trong trình duyệt này. Các bản sao đã tải vẫn còn.",
      "Elimina el plan y los registros de este navegador. Las copias descargadas se conservan.",
      "删除此浏览器中的计划和记录。已下载的备份仍会保留。",
      "이 브라우저의 계획과 기록을 삭제합니다. 다운로드한 백업은 유지됩니다.",
    ],
  ],
  [
    "Save a backup first",
    [
      "Lưu bản sao trước",
      "Guardar una copia primero",
      "先保存备份",
      "먼저 백업 저장",
    ],
  ],
  [
    "I understand this cannot be undone without a backup.",
    [
      "Tôi hiểu không thể hoàn tác nếu không có bản sao.",
      "Entiendo que no se puede deshacer sin una copia.",
      "我了解，没有备份将无法撤销。",
      "백업 없이는 되돌릴 수 없음을 이해합니다.",
    ],
  ],
  [
    "Type DELETE",
    ["Nhập DELETE", "Escriba DELETE", "输入 DELETE", "DELETE 입력"],
  ],
  [
    "Delete record",
    ["Xóa hồ sơ", "Eliminar registro", "删除记录", "기록 삭제"],
  ],
  [
    "Review before restoring",
    [
      "Kiểm tra trước khi khôi phục",
      "Revisar antes de restaurar",
      "恢复前核对",
      "복원 전 확인",
    ],
  ],
  ["Backup", ["Bản sao", "Copia", "备份", "백업"]],
  [
    "Current record",
    ["Hồ sơ hiện tại", "Registro actual", "当前记录", "현재 기록"],
  ],
  [
    "Replace this browser’s saved record and drafts.",
    [
      "Thay hồ sơ và bản nháp đã lưu trong trình duyệt.",
      "Sustituir el registro y los borradores de este navegador.",
      "替换此浏览器中已保存的记录和草稿。",
      "이 브라우저의 저장된 기록과 초안을 교체합니다.",
    ],
  ],
  [
    "Type RESTORE",
    ["Nhập RESTORE", "Escriba RESTORE", "输入 RESTORE", "RESTORE 입력"],
  ],
  [
    "Restore this backup",
    [
      "Khôi phục bản sao này",
      "Restaurar esta copia",
      "恢复此备份",
      "이 백업 복원",
    ],
  ],
  [
    "The passphrases do not match.",
    [
      "Mật khẩu không khớp.",
      "Las frases no coinciden.",
      "密码短语不一致。",
      "암호문이 일치하지 않습니다.",
    ],
  ],
  [
    "Complete the confirmation first.",
    [
      "Hoàn thành xác nhận trước.",
      "Complete primero la confirmación.",
      "请先完成确认。",
      "먼저 확인 절차를 완료하세요.",
    ],
  ],
  [
    "Save a care plan before making a backup.",
    [
      "Lưu kế hoạch trước khi sao lưu.",
      "Guarde un plan antes de crear una copia.",
      "请先保存照护计划，再创建备份。",
      "백업 전에 돌봄 계획을 저장하세요.",
    ],
  ],
  [
    "Choose a CareLoop backup under 7 MB.",
    [
      "Chọn bản sao CareLoop dưới 7 MB.",
      "Elija una copia de CareLoop menor de 7 MB.",
      "请选择小于7 MB的 CareLoop 备份。",
      "7MB 미만의 CareLoop 백업을 선택하세요.",
    ],
  ],
  [
    "This file is not a readable CareLoop backup.",
    [
      "Tệp này không phải bản sao CareLoop có thể đọc.",
      "Este archivo no es una copia legible de CareLoop.",
      "此文件不是可读取的 CareLoop 备份。",
      "읽을 수 있는 CareLoop 백업 파일이 아닙니다.",
    ],
  ],
  [
    "Encrypted backup downloaded.",
    [
      "Đã tải bản sao mã hóa.",
      "Copia cifrada descargada.",
      "加密备份已下载。",
      "암호화 백업을 다운로드했습니다.",
    ],
  ],
  [
    "Backup restored.",
    [
      "Đã khôi phục bản sao.",
      "Copia restaurada.",
      "备份已恢复。",
      "백업을 복원했습니다.",
    ],
  ],
  [
    "Care record deleted.",
    [
      "Đã xóa hồ sơ chăm sóc.",
      "Registro de cuidado eliminado.",
      "照护记录已删除。",
      "돌봄 기록이 삭제되었습니다.",
    ],
  ],
  [
    "Sample discharge summary loaded.",
    [
      "Đã tải tóm tắt xuất viện ví dụ.",
      "Resumen de ejemplo cargado.",
      "已载入示例出院小结。",
      "예시 퇴원 요약을 불러왔습니다.",
    ],
  ],
  [
    "Paste or load a summary first.",
    [
      "Dán hoặc tải tóm tắt trước.",
      "Primero pegue o cargue un resumen.",
      "请先粘贴或载入小结。",
      "먼저 요약을 붙여 넣거나 불러오세요.",
    ],
  ],
  ["Reading…", ["Đang đọc…", "Leyendo…", "正在读取…", "읽는 중…"]],
  [
    "Manual entry.",
    ["Nhập thủ công.", "Entrada manual.", "手动输入。", "직접 입력."],
  ],
  [
    "Fictional sample loaded.",
    [
      "Đã tải dữ liệu ví dụ hư cấu.",
      "Ejemplo ficticio cargado.",
      "已载入虚构示例。",
      "가상의 예시를 불러왔습니다.",
    ],
  ],
  [
    "Saved plan reopened.",
    [
      "Đã mở kế hoạch đã lưu.",
      "Plan guardado reabierto.",
      "已重新打开保存的计划。",
      "저장된 계획을 다시 열었습니다.",
    ],
  ],
  [
    "Caregiver added.",
    [
      "Đã thêm người chăm sóc.",
      "Cuidador añadido.",
      "已添加照护者。",
      "돌봄 담당자를 추가했습니다.",
    ],
  ],
  [
    "Caregivers updated.",
    [
      "Đã cập nhật người chăm sóc.",
      "Cuidadores actualizados.",
      "照护者已更新。",
      "돌봄 담당자를 업데이트했습니다.",
    ],
  ],
  ["Not saved.", ["Chưa lưu.", "No guardado.", "未保存。", "저장되지 않음."]],
  [
    "The entered timing rules fit. No changes needed.",
    [
      "Các quy tắc phù hợp. Không cần thay đổi.",
      "Las reglas encajan. No se necesitan cambios.",
      "输入的时间规则相容，无需更改。",
      "입력한 시간 규칙에 맞습니다. 변경이 필요 없습니다.",
    ],
  ],
  [
    "Add a spacing rule to try this example.",
    [
      "Thêm quy tắc khoảng cách để thử.",
      "Añada una regla de separación para probar.",
      "请先添加间隔规则再尝试。",
      "간격 규칙을 추가한 후 예시를 확인하세요.",
    ],
  ],
  [
    "Choose the other medication in the spacing rule.",
    [
      "Chọn thuốc còn lại trong quy tắc khoảng cách.",
      "Elija el otro medicamento de la regla.",
      "请选择间隔规则中的另一种药物。",
      "간격 규칙의 다른 약을 선택하세요.",
    ],
  ],
  [
    "Example only · saved plan unchanged.",
    [
      "Chỉ là ví dụ · không đổi kế hoạch đã lưu.",
      "Solo ejemplo · plan guardado sin cambios.",
      "仅为示例 · 保存的计划未改变。",
      "예시 전용 · 저장된 계획은 변경되지 않음.",
    ],
  ],
  [
    "Swipe across the table to see all columns →",
    [
      "Vuốt ngang bảng để xem mọi cột →",
      "Deslice la tabla para ver todas las columnas →",
      "左右滑动表格查看所有列 →",
      "표를 옆으로 밀어 모든 열 보기 →",
    ],
  ],
  [
    "Medication schedule by time",
    [
      "Lịch thuốc theo giờ",
      "Horario de medicamentos",
      "按时间排列的用药安排",
      "시간별 복약 일정",
    ],
  ],
  [
    "Language changes the interface only. Keep medicine names and discharge instructions as written. The reader accepts English instructions.",
    [
      "Ngôn ngữ chỉ đổi giao diện. Giữ nguyên tên thuốc và hướng dẫn xuất viện. Bộ đọc chỉ nhận hướng dẫn tiếng Anh.",
      "El idioma solo cambia la interfaz. Mantenga los nombres de medicamentos y las instrucciones originales. El lector acepta instrucciones en inglés.",
      "语言设置仅更改界面。请保留药物名称及出院说明原文。读取功能接受英文说明。",
      "언어 설정은 화면만 변경합니다. 약 이름과 퇴원 안내 원문은 그대로 유지하세요. 읽기 기능은 영어 안내를 지원합니다.",
    ],
  ],
  [
    "Replace this plan with the fictional sample?",
    [
      "Thay kế hoạch này bằng ví dụ hư cấu?",
      "¿Sustituir este plan por el ejemplo ficticio?",
      "将此计划替换为虚构示例？",
      "이 계획을 가상의 예시로 바꿀까요?",
    ],
  ],
  [
    "Discard this draft and reopen the saved plan?",
    [
      "Bỏ bản nháp và mở kế hoạch đã lưu?",
      "¿Descartar el borrador y reabrir el plan guardado?",
      "放弃草稿并重新打开已保存的计划？",
      "초안을 버리고 저장된 계획을 다시 열까요?",
    ],
  ],
  [
    "Remove this caregiver? Pending future assignments will become unassigned; recorded names stay in history.",
    [
      "Xóa người chăm sóc này? Việc chưa làm trong tương lai sẽ chưa phân công; tên đã ghi vẫn được giữ.",
      "¿Quitar este cuidador? Las tareas futuras pendientes quedarán sin asignar; los nombres registrados se conservarán.",
      "移除此照护者？未来待完成的任务将变为未分配；历史记录中的姓名会保留。",
      "이 담당자를 삭제할까요? 향후 대기 업무는 미배정으로 바뀌며 과거 기록의 이름은 유지됩니다.",
    ],
  ],
]);

for (const [english, translations] of [
  [
    "Paste the English summary. The reader pulls out drugs and, more importantly, the timing rules buried in the sentences — every field stays editable.",
    [
      "Dán tóm tắt tiếng Anh. Bộ đọc lấy thuốc và các quy tắc thời gian trong nội dung — bạn có thể sửa mọi trường.",
      "Pegue el resumen en inglés. El lector extrae los medicamentos y sus reglas de horario; todos los campos se pueden editar.",
      "粘贴英文小结。读取功能提取药物及文字中的时间规则；所有字段都可修改。",
      "영문 요약을 붙여 넣으세요. 약과 문장 속 시간 규칙을 추출하며 모든 항목을 수정할 수 있습니다.",
    ],
  ],
  [
    "Timing rules matter more than the drug list. If one was missed, the compiled schedule will be wrong.",
    [
      "Quy tắc thời gian rất quan trọng. Nếu bỏ sót, lịch được lập sẽ sai.",
      "Las reglas de horario son esenciales. Si falta alguna, el horario será incorrecto.",
      "时间规则至关重要。若有遗漏，生成的安排将不正确。",
      "시간 규칙을 꼼꼼히 확인하세요. 규칙을 빠뜨리면 생성된 일정이 잘못됩니다.",
    ],
  ],
  [
    "Gap = minimum hours from the named medicine; blank name means all others. Use only the written instructions.",
    [
      "Khoảng cách = số giờ tối thiểu với thuốc được nêu; để trống nghĩa là mọi thuốc khác. Chỉ dùng hướng dẫn đã viết.",
      "Intervalo = horas mínimas respecto al medicamento indicado; en blanco se aplica a todos los demás. Use solo las indicaciones escritas.",
      "间隔指与指定药物之间的最少小时数；名称留空表示所有其他药物。请仅采用书面说明。",
      "간격은 지정한 약과의 최소 시간입니다. 이름을 비우면 다른 모든 약에 적용됩니다. 작성된 지침만 사용하세요.",
    ],
  ],
  [
    "With food: within 30 min. Before/after food: 15–60 min. Morning: 08:00; bedtime: 22:00. Exact intervals stay exact; other multiple daily doses use daytime slots at least 4h apart. Review these supported timing assumptions against the instructions.",
    [
      "Cùng thức ăn: trong 30 phút. Trước/sau ăn: 15–60 phút. Buổi sáng: 08:00; giờ ngủ: 22:00. Khoảng cách chính xác được giữ nguyên; các liều khác trong ngày cách ít nhất 4 giờ vào ban ngày. Đối chiếu các giả định này với hướng dẫn.",
      "Con comida: dentro de 30 min. Antes/después: 15–60 min. Mañana: 08:00; al acostarse: 22:00. Se mantienen los intervalos exactos; las demás dosis múltiples se separan al menos 4 h durante el día. Compare estas suposiciones con las indicaciones.",
      "随餐：30分钟内。餐前或餐后：15–60分钟。早晨为08:00，睡前为22:00。精确间隔保持不变；其他每日多次用药采用白天至少相隔4小时的时段。请将这些时间假设与原说明核对。",
      "음식과 함께는 30분 이내, 식전·식후는 15~60분으로 봅니다. 아침은 08:00, 취침은 22:00입니다. 정확한 간격은 유지하며 그 외 하루 여러 번 복용은 낮에 최소 4시간 간격으로 배치합니다. 이 시간 가정을 원문과 대조하세요.",
    ],
  ],
  [
    "The compiler places every dose so that all timing rules hold at once. Move one thing and it re-checks the whole day.",
    [
      "Bộ lập lịch đặt từng liều để đáp ứng mọi quy tắc thời gian. Khi thay đổi, cả ngày được kiểm tra lại.",
      "El sistema organiza las dosis para cumplir todas las reglas de horario. Al cambiar algo, vuelve a comprobar todo el día.",
      "系统安排每次用药，使所有时间规则同时成立。任何变动都会重新检查全天安排。",
      "모든 시간 규칙을 함께 충족하도록 복용 시간을 배치합니다. 항목을 바꾸면 하루 전체를 다시 확인합니다.",
    ],
  ],
  [
    "Automatic resolution preserves the entered doses and timing rules.",
    [
      "Tự điều chỉnh giữ nguyên liều và quy tắc thời gian đã nhập.",
      "El ajuste automático conserva las dosis y reglas introducidas.",
      "自动调整会保留输入的剂量和时间规则。",
      "자동 조정 시 입력한 용량과 시간 규칙을 유지합니다.",
    ],
  ],
  [
    "Reads structured English discharge instructions, extracts supported timing rules written into it, and compiles a daily schedule that satisfies all of them at once. Then it keeps a local record of who gave what — and flags the moment that record stops matching the rules.",
    [
      "Đọc hướng dẫn xuất viện tiếng Anh có cấu trúc, lấy các quy tắc thời gian được hỗ trợ và lập lịch hằng ngày đáp ứng các quy tắc đó. Lưu tại chỗ ai đã cho thuốc gì và cảnh báo khi ghi nhận không còn phù hợp quy tắc.",
      "Lee instrucciones estructuradas de alta en inglés, extrae las reglas de horario compatibles y crea un horario que las cumple. Guarda localmente quién administró cada dosis y señala discrepancias con las reglas.",
      "读取结构化英文出院说明，提取支持的时间规则，并生成同时满足这些规则的每日安排。在本机记录谁完成了哪些用药，并标出记录与规则不符的情况。",
      "구조화된 영문 퇴원 안내에서 지원하는 시간 규칙을 추출해 하루 일정을 만듭니다. 누가 무엇을 제공했는지 기기에 기록하고 규칙과 달라진 기록을 표시합니다.",
    ],
  ],
  [
    "A chatbot can turn the text into a list. That part was never the hard part. What it cannot do:",
    [
      "Chatbot có thể đổi văn bản thành danh sách. Nhưng ứng dụng này còn hỗ trợ:",
      "Un chatbot puede convertir el texto en una lista. Esta aplicación también ofrece:",
      "聊天机器人可以把文字整理为列表。本应用还提供以下功能：",
      "챗봇은 글을 목록으로 정리할 수 있습니다. 이 앱은 다음 기능도 제공합니다.",
    ],
  ],
  [
    "A chat forgets which dose was actually given at 08:00 yesterday",
    [
      "Giữ lại liều đã được ghi nhận lúc 08:00 hôm qua",
      "Conservar qué dosis se registró ayer a las 08:00",
      "保留昨天08:00实际记录的用药",
      "어제 08:00에 기록된 복용 내역 유지",
    ],
  ],
  [
    "“At least two hours apart from Furosemide” is a constraint, not a sentence. It has to be placed, and re-placed every time something moves",
    [
      "“Cách Furosemide ít nhất hai giờ” là quy tắc cần tính vào lịch và kiểm tra mỗi khi có thay đổi",
      "«Separar al menos dos horas de Furosemide» es una restricción que debe recalcularse cuando cambia el horario",
      "“与 Furosemide 至少间隔两小时”是一项约束，每次安排变动都需重新计算",
      "“Furosemide와 최소 2시간 간격”은 일정이 바뀔 때마다 다시 계산해야 하는 규칙입니다",
    ],
  ],
  [
    "Nobody sees that two doses landed 40 minutes apart until the log is checked against the rules",
    [
      "Đối chiếu ghi nhận với quy tắc để phát hiện hai liều cách nhau 40 phút",
      "Comparar el registro con las reglas permite detectar dos dosis separadas solo 40 minutos",
      "将记录与规则核对，才能发现两次用药仅间隔40分钟",
      "기록을 규칙과 대조해 두 복용이 40분 간격으로 기록되었는지 확인",
    ],
  ],
  [
    "Caregiver labels and task status on this device; remote sharing is not included",
    [
      "Tên người chăm sóc và trạng thái công việc trên thiết bị này; chưa có chia sẻ từ xa",
      "Nombres de cuidadores y estado de tareas en este dispositivo; no incluye compartir a distancia",
      "在此设备保存照护者名称和任务状态；不提供远程共享",
      "이 기기에 담당자 이름과 업무 상태를 저장하며 원격 공유는 지원하지 않습니다",
    ],
  ],
  [
    "Not a medical device. It does not advise, diagnose, or predict outcomes. It compiles a schedule from what a clinician already wrote down, and keeps a family's record consistent. All sample data is fictional.",
    [
      "Không phải thiết bị y tế. Không tư vấn, chẩn đoán hay dự đoán kết quả. Lập lịch từ hướng dẫn bác sĩ đã viết và giữ ghi nhận gia đình nhất quán. Mọi dữ liệu ví dụ đều hư cấu.",
      "No es un dispositivo médico. No aconseja, diagnostica ni predice resultados. Organiza lo que el profesional ya indicó y mantiene coherente el registro familiar. Todos los datos de ejemplo son ficticios.",
      "本应用不是医疗器械，不提供建议、诊断或结果预测。它根据医护人员已写明的说明生成安排，并保持家庭记录一致。所有示例数据均为虚构。",
      "의료기기가 아니며 조언, 진단, 결과 예측을 제공하지 않습니다. 의료진이 작성한 지침으로 일정을 만들고 가족의 기록을 일관되게 유지합니다. 모든 예시 데이터는 가상입니다.",
    ],
  ],
  [
    "Everything runs in the browser. There is no server, no account, and no network call: the file opens from disk and works with the wi-fi off.",
    [
      "Mọi xử lý chạy trong trình duyệt, không có máy chủ dữ liệu, tài khoản hay yêu cầu mạng. Tệp có thể mở từ thiết bị khi tắt Wi-Fi.",
      "Todo se ejecuta en el navegador, sin servidor de datos, cuenta ni solicitudes de red. El archivo funciona desde el dispositivo sin wifi.",
      "所有处理均在浏览器中完成，不使用数据服务器、账户或网络请求。文件可从本机打开，在关闭无线网络时仍可运行。",
      "모든 처리는 브라우저에서 실행되며 데이터 서버, 계정, 네트워크 요청이 없습니다. 기기의 파일을 열어 와이파이 없이 사용할 수 있습니다.",
    ],
  ],
  [
    "A pasted discharge summary is parsed by a fixed rule set — section markers, dose patterns, frequency phrases, meal relations, and interval phrases such as “at least two hours apart”. Unrecognized medication lines are shown for manual review; sample medicines are never inserted into real input. The parsed fields are shown for review before any schedule is built. All sample data in this file is fictional.",
    [
      "Bản tóm tắt được đọc bằng quy tắc cố định về mục, liều, tần suất, bữa ăn và khoảng cách. Các dòng không nhận ra được hiện để kiểm tra thủ công; thuốc ví dụ không được thêm vào dữ liệu thật. Bạn kiểm tra các trường trước khi lập lịch. Dữ liệu ví dụ đều hư cấu.",
      "El resumen se analiza con reglas fijas de secciones, dosis, frecuencia, comidas e intervalos. Las líneas no reconocidas se muestran para revisión manual; nunca se añaden medicamentos de ejemplo a los datos reales. Los campos se revisan antes de crear el horario. Los ejemplos son ficticios.",
      "粘贴的小结通过固定规则解析，包括章节、剂量、频次、用餐关系及“至少间隔两小时”等表述。无法识别的药物行会列出供手动核对，示例药物不会加入实际输入。生成安排前会展示所有解析字段供核对。示例数据均为虚构。",
      "붙여 넣은 요약은 항목, 용량, 빈도, 식사 관계, 시간 간격의 고정 규칙으로 읽습니다. 인식하지 못한 약 항목은 직접 확인하도록 표시하며 실제 입력에 예시 약을 추가하지 않습니다. 일정을 만들기 전에 추출된 항목을 확인합니다. 예시 데이터는 모두 가상입니다.",
    ],
  ],
  [
    "HTML · CSS · JavaScript · local JSON storage",
    [
      "HTML · CSS · JavaScript · lưu JSON tại chỗ",
      "HTML · CSS · JavaScript · almacenamiento JSON local",
      "HTML · CSS · JavaScript · 本机 JSON 存储",
      "HTML · CSS · JavaScript · 로컬 JSON 저장",
    ],
  ],
  [
    "No account or care-data backend. Build produces a standalone HTML file.",
    [
      "Không tài khoản hay máy chủ dữ liệu chăm sóc. Có bản HTML độc lập.",
      "Sin cuenta ni servidor de datos de cuidado. Se genera un archivo HTML independiente.",
      "无需账户或照护数据后端，可生成独立 HTML 文件。",
      "계정이나 돌봄 데이터 서버가 없으며 독립 HTML 파일을 제공합니다.",
    ],
  ],
  [
    "Records stay in this browser. Downloaded backups are encrypted with your passphrase. Clearing browser data deletes the working record; keep a backup. Caregiver names are local labels, not verified identities.",
    [
      "Hồ sơ ở trong trình duyệt này. Bản sao được mã hóa bằng mật khẩu của bạn. Xóa dữ liệu trình duyệt sẽ xóa hồ sơ đang dùng; hãy giữ bản sao. Tên người chăm sóc là nhãn tại chỗ, không phải danh tính xác minh.",
      "Los registros se guardan en este navegador. Las copias se cifran con su frase. Borrar los datos del navegador elimina el registro; conserve una copia. Los nombres son etiquetas locales, no identidades verificadas.",
      "记录保存在此浏览器中。下载的备份以您的密码短语加密。清除浏览器数据会删除当前记录，请保留备份。照护者姓名只是本机标签，未经身份验证。",
      "기록은 이 브라우저에 저장됩니다. 다운로드한 백업은 암호문으로 암호화됩니다. 브라우저 데이터를 지우면 기록도 삭제되므로 백업을 보관하세요. 담당자 이름은 본인 확인을 거치지 않은 기기 내 표시입니다.",
    ],
  ],
  [
    "Paste one, or open a sample, and CareLoop turns the timing rules buried in the sentences into a 30-day schedule.",
    [
      "Dán bản tóm tắt hoặc mở ví dụ để CareLoop lập lịch 30 ngày từ các quy tắc thời gian.",
      "Pegue un resumen o abra un ejemplo para crear un horario de 30 días con sus reglas.",
      "粘贴小结或打开示例，CareLoop 会依据其中的时间规则生成30天安排。",
      "요약을 붙여 넣거나 예시를 열면 시간 규칙으로 30일 일정을 만듭니다.",
    ],
  ],
  [
    "— paste the English summary, or load the sample.",
    [
      "— dán tóm tắt tiếng Anh hoặc tải ví dụ.",
      "— pegue el resumen en inglés o cargue el ejemplo.",
      "— 粘贴英文小结或载入示例。",
      "— 영문 요약을 붙여 넣거나 예시를 불러옵니다.",
    ],
  ],
  [
    "— every extracted field is editable before anything is scheduled.",
    [
      "— sửa mọi trường trước khi lập lịch.",
      "— edite todos los campos antes de crear el horario.",
      "— 安排前可修改所有提取的字段。",
      "— 일정 생성 전에 모든 항목을 수정할 수 있습니다.",
    ],
  ],
  [
    "— doses are placed so the gap and meal rules hold together.",
    [
      "— bố trí liều theo cả khoảng cách và bữa ăn.",
      "— organice las dosis respetando intervalos y comidas.",
      "— 同时遵循间隔及用餐规则安排用药。",
      "— 간격과 식사 규칙에 맞춰 복용을 배치합니다.",
    ],
  ],
  [
    "— tick off what was given; the log is checked against the rules.",
    [
      "— ghi đã cho thuốc gì; kiểm tra ghi nhận với quy tắc.",
      "— registre lo administrado y compruebe las reglas.",
      "— 记录实际用药，并将记录与规则核对。",
      "— 실제 복용을 기록하고 규칙과 대조합니다.",
    ],
  ],
  [
    "{0} doses and checks on {1} · {2} in the 30-day plan",
    [
      "{0} liều và kiểm tra ngày {1} · {2} trong kế hoạch 30 ngày",
      "{0} dosis y controles el {1} · {2} en el plan de 30 días",
      "{1}有{0}项用药及检查 · 30天共{2}项",
      "{1} 복용 및 확인 {0}건 · 30일 계획 총 {2}건",
    ],
  ],
  [
    "{0} doses and checks over {1} days",
    [
      "{0} liều và kiểm tra trong {1} ngày",
      "{0} dosis y controles en {1} días",
      "{1}天内共{0}项用药及检查",
      "{1}일 동안 복용 및 확인 {0}건",
    ],
  ],
  ["/{0} done", ["/{0} đã xong", "/{0} hechas", "/{0}已完成", "/{0} 완료"]],
  [
    "Schedule for {0}. Supported rules satisfied.",
    [
      "Lịch ngày {0}. Đáp ứng quy tắc được hỗ trợ.",
      "Horario del {0}. Se cumplen las reglas compatibles.",
      "{0}的安排。已满足支持的规则。",
      "{0} 일정. 지원되는 규칙을 충족합니다.",
    ],
  ],
  [
    "Schedule for {0}.",
    ["Lịch ngày {0}.", "Horario del {0}.", "{0}的安排。", "{0} 일정."],
  ],
  [
    "Assigned to {0} ({1})",
    [
      "Phân công cho {0} ({1})",
      "Asignado a {0} ({1})",
      "负责人：{0}（{1}）",
      "담당: {0} ({1})",
    ],
  ],
  [
    "Scheduled {0} · {1}",
    [
      "Dự kiến {0} · {1}",
      "Programado {0} · {1}",
      "计划时间 {0} · {1}",
      "예정 {0} · {1}",
    ],
  ],
  [
    "Corrections ({0})",
    [
      "Sửa đổi ({0})",
      "Correcciones ({0})",
      "修改记录（{0}）",
      "수정 내역 ({0})",
    ],
  ],
  [
    "{0} h from {1}",
    [
      "{0} giờ cách {1}",
      "{0} h de {1}",
      "与{1}间隔{0}小时",
      "{1}와 {0}시간 간격",
    ],
  ],
  [
    "Enter the patient name.",
    [
      "Nhập tên bệnh nhân.",
      "Introduzca el nombre del paciente.",
      "请输入患者姓名。",
      "환자 이름을 입력하세요.",
    ],
  ],
  [
    "Enter a valid discharge date (YYYY-MM-DD).",
    [
      "Nhập ngày xuất viện hợp lệ (YYYY-MM-DD).",
      "Introduzca una fecha de alta válida (AAAA-MM-DD).",
      "请输入有效出院日期（YYYY-MM-DD）。",
      "올바른 퇴원일을 입력하세요(YYYY-MM-DD).",
    ],
  ],
  [
    "Review the instructions that were not read.",
    [
      "Kiểm tra hướng dẫn chưa đọc được.",
      "Revise las indicaciones no reconocidas.",
      "请核对未能读取的说明。",
      "읽지 못한 지침을 확인하세요.",
    ],
  ],
  [
    "Enter a medication name or remove the empty row.",
    [
      "Nhập tên thuốc hoặc xóa dòng trống.",
      "Introduzca un medicamento o quite la fila vacía.",
      "请输入药物名称或删除空行。",
      "약 이름을 입력하거나 빈 행을 삭제하세요.",
    ],
  ],
  [
    "Another tab changed the record. Reload the saved plan before saving this draft.",
    [
      "Tab khác đã đổi hồ sơ. Tải lại kế hoạch đã lưu trước khi lưu bản nháp.",
      "Otra pestaña cambió el registro. Recargue el plan antes de guardar el borrador.",
      "另一标签页已更改记录。请重新载入保存的计划后再保存草稿。",
      "다른 탭에서 기록을 변경했습니다. 초안을 저장하기 전에 저장된 계획을 다시 불러오세요.",
    ],
  ],
  [
    "Another tab updated the record. Your draft is unchanged; reload the saved plan before saving.",
    [
      "Tab khác đã cập nhật hồ sơ. Bản nháp chưa đổi; tải lại kế hoạch trước khi lưu.",
      "Otra pestaña actualizó el registro. El borrador no cambió; recargue el plan antes de guardar.",
      "另一标签页已更新记录。草稿未变，请先重新载入保存的计划。",
      "다른 탭에서 기록을 업데이트했습니다. 초안은 유지되며 저장 전에 계획을 다시 불러와야 합니다.",
    ],
  ],
  [
    "Another tab changed the record. Cancel and reopen this task before saving.",
    [
      "Tab khác đã đổi hồ sơ. Hủy và mở lại việc này trước khi lưu.",
      "Otra pestaña cambió el registro. Cancele y vuelva a abrir la tarea antes de guardar.",
      "另一标签页已更改记录。请取消并重新打开此任务后再保存。",
      "다른 탭에서 기록을 변경했습니다. 취소 후 할 일을 다시 열어 저장하세요.",
    ],
  ],
  [
    "The saved record could not be opened. It has not been deleted.",
    [
      "Không mở được hồ sơ đã lưu. Hồ sơ chưa bị xóa.",
      "No se pudo abrir el registro. No se ha eliminado.",
      "无法打开保存的记录。记录未被删除。",
      "저장된 기록을 열 수 없습니다. 삭제되지는 않았습니다.",
    ],
  ],
])
  interfaceCopy.set(english, translations);
for (const [english, translations] of [
  [
    "Main navigation",
    ["Điều hướng chính", "Navegación principal", "主导航", "주 탐색"],
  ],
  ["Read Discharge", ["Xuất viện", "Alta médica", "出院说明", "퇴원 안내"]],
  [
    "Swipe across the timeline to see the full day →",
    [
      "Vuốt ngang để xem cả ngày →",
      "Deslice para ver el día completo →",
      "左右滑动查看全天安排 →",
      "옆으로 밀어 하루 전체 보기 →",
    ],
  ],
  [
    "at least {0} hours from {1}",
    [
      "cách {1} ít nhất {0} giờ",
      "al menos {0} horas de {1}",
      "与{1}至少间隔{0}小时",
      "{1}와 최소 {0}시간 간격",
    ],
  ],
  [
    "at least {0} hour from {1}",
    [
      "cách {1} ít nhất {0} giờ",
      "al menos {0} hora de {1}",
      "与{1}至少间隔{0}小时",
      "{1}와 최소 {0}시간 간격",
    ],
  ],
  [
    "with breakfast",
    ["cùng bữa sáng", "con el desayuno", "随早餐", "아침 식사와 함께"],
  ],
  [
    "before breakfast",
    ["trước bữa sáng", "antes del desayuno", "早餐前", "아침 식전"],
  ],
  [
    "after breakfast",
    ["sau bữa sáng", "después del desayuno", "早餐后", "아침 식후"],
  ],
  [
    "with lunch",
    ["cùng bữa trưa", "con el almuerzo", "随午餐", "점심 식사와 함께"],
  ],
  [
    "before lunch",
    ["trước bữa trưa", "antes del almuerzo", "午餐前", "점심 식전"],
  ],
  [
    "after lunch",
    ["sau bữa trưa", "después del almuerzo", "午餐后", "점심 식후"],
  ],
  [
    "with dinner",
    ["cùng bữa tối", "con la cena", "随晚餐", "저녁 식사와 함께"],
  ],
  [
    "before dinner",
    ["trước bữa tối", "antes de la cena", "晚餐前", "저녁 식전"],
  ],
  [
    "after dinner",
    ["sau bữa tối", "después de la cena", "晚餐后", "저녁 식후"],
  ],
])
  interfaceCopy.set(english, translations);
const languageCodes = ["en", "vi", "es", "zh", "ko"];
const languagePreferenceKey = "careloop_interface_language";
let interfaceLanguage = "en";
try {
  const saved = localStorage.getItem(languagePreferenceKey);
  if (languageCodes.includes(saved)) interfaceLanguage = saved;
} catch {
  /* A language choice still works when browser storage is unavailable. */
}
const normaliseCopy = (value) => value.replace(/\s+/g, " ").trim();
const copyPatterns = [...interfaceCopy]
  .filter(([key]) => key.includes("{0}"))
  .map(([key, translations]) => {
    const expression = key
      .split(/(\{\d+\})/)
      .map((part) =>
        /^\{\d+\}$/.test(part)
          ? "(.+?)"
          : part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
      )
      .join("");
    return { expression: new RegExp("^" + expression + "$"), translations };
  });
export function translateInterfaceText(english) {
  if (interfaceLanguage === "en") return english;
  const key = normaliseCopy(english);
  const index = languageCodes.indexOf(interfaceLanguage) - 1;
  const direct = interfaceCopy.get(key)?.[index];
  if (direct) return direct;
  for (const { expression, translations } of copyPatterns) {
    const match = key.match(expression);
    if (match)
      return translations[index].replace(
        /\{(\d+)\}/g,
        (_, i) => match[Number(i) + 1],
      );
  }
  return english;
}
export function createLanguageControl() {
  const select = document.querySelector("#languageSelect");
  const sources = new WeakMap();
  const attributeSources = new WeakMap();
  const protectedText =
    'script,style,textarea,[data-no-translate],#languageSelect,#hdrPat,#nextTitle,#fLang,#record-title,#taskList tbody td:nth-child(2),#teamCard tbody td:first-child,#scheduleBody tbody td:first-child,#readWarnings .banner > div,.mReviewed,.mDrug,.mDose,.mTarget,[name="note"]';
  let scheduled = false;
  const observer = new MutationObserver(() => {
    if (scheduled) return;
    scheduled = true;
    queueMicrotask(() => {
      scheduled = false;
      applyLanguage();
    });
  });
  function applyLanguage() {
    observer.disconnect();
    document.documentElement.lang = interfaceLanguage;
    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT,
    );
    while (walker.nextNode()) {
      const node = walker.currentNode,
        parent = node.parentElement;
      if (!parent || parent.closest(protectedText)) continue;
      // User-selected caregiver names and their stored identifiers are never translated.
      if (
        parent.matches("option") &&
        parent.closest('[data-who],[name="recordedBy"]') &&
        parent.value
      )
        continue;
      if (parent.matches("option") && !parent.hasAttribute("value"))
        parent.value = parent.textContent;
      let source = sources.get(node);
      if (!source || node.data !== source.last)
        source = { english: node.data, last: node.data };
      const key = normaliseCopy(source.english);
      const translated = translateInterfaceText(key);
      const next =
        translated === key
          ? source.english
          : source.english.replace(/\S[\s\S]*\S|\S/, translated);
      if (node.data !== next) node.data = next;
      source.last = next;
      sources.set(node, source);
    }
    for (const element of document.querySelectorAll(
      "[placeholder],[aria-label],[title]",
    )) {
      if (element.closest("[data-no-translate],#languageSelect")) continue;
      let originals = attributeSources.get(element);
      if (!originals) {
        originals = {};
        attributeSources.set(element, originals);
      }
      for (const attribute of ["placeholder", "aria-label", "title"]) {
        const current = element.getAttribute(attribute);
        if (current == null) continue;
        if (!originals[attribute] || current !== originals[attribute].last)
          originals[attribute] = { english: current, last: current };
        const next = translateInterfaceText(originals[attribute].english);
        if (current !== next) element.setAttribute(attribute, next);
        originals[attribute].last = next;
      }
    }
    select.value = interfaceLanguage;
    document.querySelector("#languageNote").hidden = interfaceLanguage === "en";
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
    });
  }
  select.addEventListener("change", () => {
    if (!languageCodes.includes(select.value)) return;
    interfaceLanguage = select.value;
    try {
      localStorage.setItem(languagePreferenceKey, interfaceLanguage);
    } catch {}
    applyLanguage();
  });
  applyLanguage();
}
