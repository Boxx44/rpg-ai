/**
 * Ajuda para iniciantes (Ordem Paranormal RPG v1.3): explicações escritas com
 * palavras próprias, conferidas no livro, sempre com a página do PDF.
 * Nada aqui é regra nova — só explica as regras já presentes no modelo.
 */
import type { SystemDefinition } from '../system';

export const OP_HELP: NonNullable<SystemDefinition['help']> = {
  steps: {
    concept: {
      title: 'Quem é o seu personagem?',
      text: 'Antes dos números, pense numa ideia curta: o que ele fazia antes de conhecer o paranormal, como foi o primeiro contato com o Outro Lado e como reage numa investigação e numa briga. Uma frase basta — ex.: "cientista forense curiosa que nunca usou uma arma".',
      page: 24,
    },
    attributes: {
      title: 'Atributos: o que o corpo e a mente sabem fazer',
      text: 'São cinco números. 1 é uma pessoa comum; 2 ou 3 é acima da média; 0 é fraco nisso. Num teste você rola um d20 para cada ponto do atributo e fica com o MELHOR resultado (com 0, rola dois e fica com o pior). Todos começam em 1, você distribui 4 pontos, pode baixar um para 0 e ganhar +1 ponto, e o máximo inicial é 3.',
      page: 24,
    },
    origin: {
      title: 'Origem: a vida antes da Ordem',
      text: 'A origem é a profissão ou história do personagem antes de entrar para a Ordem. Ela dá duas perícias treinadas e um poder especial. Escolha a que combina com o seu conceito — não existe origem "errada".',
      page: 26,
    },
    class: {
      title: 'Classe: o papel no grupo',
      text: 'A classe é o treinamento de agente. Combatente aguenta e causa dano; Especialista resolve problemas com perícias; Ocultista usa rituais do Outro Lado. A classe define seus Pontos de Vida, Pontos de Esforço, Sanidade, perícias e armas que sabe usar.',
      page: 32,
    },
    skills: {
      title: 'Perícias: no que você é treinado',
      text: 'Perícias são áreas de conhecimento ou habilidade. Ser treinado dá +5 nos testes daquela perícia (e algumas só podem ser usadas por quem é treinado). A origem e a classe já dão algumas; o resto você escolhe. Intelecto alto = mais perícias.',
      page: 46,
    },
    equipment: {
      title: 'Equipamento inicial',
      text: 'Escolha as armas que sua classe sabe usar e, se puder, uma proteção (soma na Defesa, mas ocupa espaço). Ocultistas escolhem aqui os três rituais de 1º círculo com que começam. Tudo pode ser trocado depois na ficha.',
      page: 63,
    },
    review: {
      title: 'Confira e crie',
      text: 'Veja o resumo. Depois de criar, a ficha completa abre e você ainda pode escolher trilha (a partir de NEX 10%), poderes e escrever a história do personagem.',
    },
  },
  attributes: {
    AGI: 'Agilidade: rapidez, reflexos e precisão. Base de Acrobacia, Crime, Furtividade, Iniciativa, Pilotagem, Pontaria e Reflexos — e aumenta sua Defesa.',
    FOR: 'Força: potência física. Base de Atletismo e Luta, soma no dano corpo a corpo e de arremesso, e define quanto peso você carrega.',
    INT: 'Intelecto: raciocínio, memória e estudo. Base das perícias de conhecimento (Ciências, Investigação, Medicina, Ocultismo…). Cada ponto dá uma perícia treinada a mais.',
    PRE: 'Presença: força de vontade, percepção e lábia. Base de Diplomacia, Enganação, Intimidação, Intuição, Percepção, Religião e Vontade — e dá mais Pontos de Esforço.',
    VIG: 'Vigor: saúde e resistência. Base de Fortitude e dá mais Pontos de Vida.',
  },
  skills: {
    acrobacia: 'Equilíbrio, saltos, amortecer quedas e escapar de agarrões.',
    adestramento: 'Lidar com animais: acalmar, treinar e montar. (Só treinado)',
    artes: 'Música, atuação, pintura, escrita — impressionar e entreter. (Só treinado)',
    atletismo: 'Correr, escalar, nadar e pular.',
    atualidades: 'Saber de política, esporte, cultura e notícias.',
    ciencias: 'Matemática, física, química e biologia. (Só treinado)',
    crime: 'Arrombar fechaduras, furtar e sabotar. (Só treinado)',
    diplomacia: 'Convencer, negociar e acalmar alguém que está enlouquecendo.',
    enganacao: 'Mentir, blefar e se disfarçar.',
    fortitude: 'Resistir a venenos, doenças e cansaço (teste de resistência).',
    furtividade: 'Se esconder e se mover sem ser notado.',
    iniciativa: 'Velocidade de reação: define a ordem dos turnos no combate.',
    intimidacao: 'Assustar e coagir pessoas.',
    intuicao: 'Empatia e "sexto sentido": perceber mentiras e intenções.',
    investigacao: 'Encontrar pistas, pesquisar e interrogar.',
    luta: 'Atacar corpo a corpo (socos, facas, machados…).',
    medicina: 'Primeiros socorros e tratar ferimentos, doenças e venenos.',
    ocultismo: 'Conhecer o paranormal: identificar criaturas e entender rituais. (Só treinado)',
    percepcao: 'Notar coisas com os sentidos: ver, ouvir, achar o escondido.',
    pilotagem: 'Dirigir carros, motos e barcos em situações difíceis. (Só treinado)',
    pontaria: 'Atacar à distância (armas de fogo, arcos, arremessos).',
    profissao: 'Conhecimento da sua profissão (cozinheiro, advogado, engenheiro…). (Só treinado)',
    reflexos: 'Esquivar de armadilhas, explosões e perigos rápidos (resistência).',
    religiao: 'Teologia e religiões; também serve para acalmar quem está enlouquecendo. (Só treinado)',
    sobrevivencia: 'Se virar na natureza: rastrear, acampar, achar comida.',
    tatica: 'Educação militar: analisar o terreno e planejar o combate. (Só treinado)',
    tecnologia: 'Computadores, eletrônicos e invasão de sistemas. (Só treinado)',
    vontade: 'Resistir a medo, manipulação e efeitos mentais (resistência).',
  },
  origins: {
    academico: {
      power: 'Saber é Poder',
      text: 'Em testes de Intelecto, pode gastar 2 PE para ganhar +5.',
      page: 26,
    },
    agente_saude: {
      power: 'Técnica Medicinal',
      text: 'Quando cura alguém, soma seu Intelecto aos PV curados.',
      page: 26,
    },
    amnesico: {
      power: 'Vislumbres do Passado',
      text: 'Uma vez por sessão pode tentar reconhecer algo do passado; se der certo, ganha PE temporários e talvez uma informação. As perícias são escolhidas pelo mestre.',
      page: 26,
    },
    artista: {
      power: 'Magnum Opus',
      text: 'É famoso por uma obra: uma vez por missão alguém o reconhece e você ganha +5 em testes de Presença com essa pessoa.',
      page: 27,
    },
    atleta: {
      power: '110%',
      text: 'Em testes de Força ou Agilidade (fora ataques), pode gastar 2 PE para ganhar +5.',
      page: 27,
    },
    chef: {
      power: 'Ingrediente Secreto',
      text: 'No interlúdio, cozinha para o grupo: quem comer recebe o benefício de dois pratos.',
      page: 27,
    },
    criminoso: {
      power: 'O Crime Compensa',
      text: 'Ao fim da missão, guarda um item encontrado para levar na próxima sem contar no limite.',
      page: 28,
    },
    cultista: {
      power: 'Traços do Outro Lado',
      text: 'Começa com um poder paranormal, mas com metade da Sanidade normal.',
      page: 28,
    },
    desgarrado: { power: 'Calejado', text: 'Ganha +1 PV para cada 5% de NEX.', page: 28 },
    engenheiro: {
      power: 'Ferramenta Favorita',
      text: 'Um item (não arma) conta como uma categoria abaixo — mais fácil de conseguir.',
      page: 28,
    },
    executivo: {
      power: 'Processo Otimizado',
      text: 'Em testes estendidos ou ao revisar documentos, pode gastar 2 PE para ganhar +5.',
      page: 28,
    },
    investigador: {
      power: 'Faro para Pistas',
      text: 'Uma vez por cena, ao procurar pistas, pode gastar 1 PE para ganhar +5.',
      page: 29,
    },
    lutador: { power: 'Mão Pesada', text: '+2 no dano de ataques corpo a corpo.', page: 29 },
    magnata: {
      power: 'Patrocinador da Ordem',
      text: 'Seu limite de crédito é sempre um acima do normal.',
      page: 30,
    },
    mercenario: {
      power: 'Posição de Combate',
      text: 'No primeiro turno de cada cena de ação, pode gastar 2 PE para ter uma ação de movimento extra.',
      page: 30,
    },
    militar: { power: 'Para Bellum', text: '+2 no dano com armas de fogo.', page: 30 },
    operario: {
      power: 'Ferramenta de Trabalho',
      text: 'Escolha uma arma ligada à sua profissão: sabe usá-la e ganha +1 no ataque, no dano e na margem de crítico com ela.',
      page: 30,
    },
    policial: { power: 'Patrulha', text: '+2 na Defesa.', page: 30 },
    religioso: {
      power: 'Acalentar',
      text: '+5 em Religião para acalmar; quem você acalma recupera Sanidade (1d6 + sua Presença).',
      page: 30,
    },
    servidor: {
      power: 'Espírito Cívico',
      text: 'Ao ajudar alguém num teste, pode gastar 1 PE para aumentar a ajuda em +2.',
      page: 30,
    },
    teorico: { power: 'Eu Já Sabia', text: 'Resistência a dano mental igual ao seu Intelecto.', page: 31 },
    ti: {
      power: 'Motor de Busca',
      text: 'Com internet, pode gastar 2 PE para trocar um teste qualquer por Tecnologia (a critério do mestre).',
      page: 31,
    },
    rural: {
      power: 'Desbravador',
      text: 'Em Adestramento ou Sobrevivência, pode gastar 2 PE para ganhar +5; terreno difícil não o atrasa.',
      page: 31,
    },
    trambiqueiro: {
      power: 'Impostor',
      text: 'Uma vez por cena, pode gastar 2 PE para trocar um teste qualquer por Enganação.',
      page: 31,
    },
    universitario: {
      power: 'Dedicação',
      text: 'Mais PE (+1, e +1 a cada NEX ímpar) e limite de PE por turno +1.',
      page: 31,
    },
    vitima: { power: 'Cicatrizes Psicológicas', text: 'Ganha +1 de Sanidade para cada 5% de NEX.', page: 31 },
  },
  classes: {
    combatente:
      'Linha de frente: mais PV, armas táticas e proteções. Faz ataques especiais gastando PE. Bom para quem quer agir no combate.',
    especialista:
      'O "faz-tudo": muitas perícias treinadas e truques para resolver problemas. Bom para investigar, convencer e improvisar.',
    ocultista:
      'Usa rituais do Outro Lado desde o início (3 rituais de 1º círculo), com mais PE e menos PV. Bom para quem quer magia, com risco para a Sanidade.',
  },
  terms: {
    pv: {
      label: 'Pontos de Vida (PV)',
      text: 'Sua saúde física. Com metade ou menos você fica Machucado; em 0, Morrendo.',
      page: 35,
    },
    pe: {
      label: 'Pontos de Esforço (PE)',
      text: 'Sua energia para usar habilidades e rituais. Volta com descanso no interlúdio.',
      page: 35,
    },
    san: {
      label: 'Sanidade (SAN)',
      text: 'Sua saúde mental. O paranormal e os rituais a desgastam; em 0, o personagem enlouquece.',
      page: 35,
    },
    defesa: {
      label: 'Defesa',
      text: 'O número que um ataque precisa alcançar para te acertar: 10 + Agilidade + proteção.',
      page: 46,
    },
    nex: {
      label: 'NEX (Nível de Exposição)',
      text: 'O quanto o personagem já foi exposto ao paranormal — é o "nível" dele. Sobe de 5% em 5% e libera habilidades.',
      page: 33,
    },
    limite_pe: {
      label: 'Limite de PE por turno',
      text: 'O máximo de PE que você pode gastar num único turno. Cresce com o NEX.',
      page: 33,
    },
    dt_rituais: {
      label: 'DT de rituais',
      text: 'O número que o alvo precisa tirar para resistir aos seus rituais: 10 + limite de PE + Presença.',
      page: 131,
    },
    carga: {
      label: 'Carga máxima',
      text: 'Quantos espaços de itens você carrega: 5 por ponto de Força (2 se Força 0). Passar disso deixa você lento e mais fácil de acertar.',
      page: 63,
    },
    carga_usada: {
      label: 'Espaços ocupados',
      text: 'Soma do espaço das armas, proteções e outros itens que você carrega.',
      page: 63,
    },
    deslocamento: {
      label: 'Deslocamento',
      text: 'Quantos metros você anda numa ação de movimento.',
      page: 46,
    },
    trilha: {
      label: 'Trilha',
      text: 'Especialização dentro da classe, escolhida em NEX 10%. Dá habilidades novas em 10%, 40%, 65% e 99%.',
      page: 34,
    },
    treinamento: {
      label: 'Grau de treinamento',
      text: 'Destreinado (+0), Treinado (+5), Veterano (+10) e Expert (+15) nos testes da perícia.',
      page: 46,
    },
  },
};
